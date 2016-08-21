var sqlite3 = require('sqlite3')
var util = require('util');
var async = require('async');
var EventEmitter = require('events');

var parallelLimit = 1;


//Goal pass a structure definition JS object, a contract and a SQL database (Assumes you are using sqllite3)

function sqlcache(filename, account, callback){
	//Sqlcache object is initialized to automatically maintain a table created for that contract
	//under the name contractname
	this.db = new sqlite3.Database(filename, callback);
	this.contracts = {};
	this.accessAccount = account;

	this.emitter = new EventEmitter;

}

//util.inherits(sqlcache, EventEmitter);

module.exports = sqlcache;

for (var k in sqlite3.Database.prototype){
	sqlcache.prototype[k] = function(){
		this.db[k].apply(this.db, arguments)
	}
}


function fillTables(cache, contract, contractName, tables, initSeq, cb) {

	//Now InitSeq is ready to run all the table fillings
	//loop through the tables then loop and loop calls to the update function.
	async.forEachOfSeries(tables, function(table, tabName, callback){
		var key1 = table.keys[0];
		var key2 = "";
		var tks = false;

		if (table.keys.length == 2){
			key2 = table.keys[1];
			tks = true;
		}

		var kpairs = [];
		for (var i = initSeq[key1].min; i < initSeq[key1].max; i++) {
			if (tks){
				var kv2max = (!initSeq[key2].dependent) ? initSeq[key2].max : initSeq[key2].max[i];
				for (var j = initSeq[key2].min; j < kv2max; j++) {
					kpairs.push([i, j]);
				};
			} else {
				kpairs.push([i]);
			}
		};

		function fill(cb){
			async.eachSeries(kpairs, function(keys, callback2){
				if(tks){
					cache.update(contractName, tabName, keys[0], keys[1], callback2);
				} else {
					cache.update(contractName, tabName, keys[0], callback2);
				}
			}, cb);
		}

		function secondTranslate(cb) {
			//Check if a second translation needs to be done. Do it if need be then call the table filling
			if (tks && initSeq[key2].deserialize){
				async.eachOfSeries(kpairs, function(keys, index, callback){
				//If the first key has a deserialize function specified
					contract[initSeq[key2].deserialize].call(keys[0], keys[1], function(err, data){
						if(err) return callback(err);
						kpairs[index][1] = data.raw[0];
						return callback(null);
					})
				}, function(err){
					if (err) throw err;
					fill(cb);
				})
			} else {
				fill(cb);
			}
		}

		if (initSeq[key1].deserialize){
			async.eachOfSeries(kpairs, function(keys, index, callback2){
				//If the first key has a deserialize function specified
				contract[initSeq[key1].deserialize].call(keys[0], function(err, data){
					if(err) callback2(err);
					kpairs[index][0] = data.raw[0];
					callback2(null)
				})
			}, function(err){
				if (err) throw err;
				secondTranslate(callback)
			})
		} else {
			secondTranslate(callback)
		}
	}, cb)
}



//TODO Add in the option to also retrieve the minimum value?

//This is a very expensive operation. should only be used if you have nothing better to do
sqlcache.prototype.initTables = function(contractName, cb){
	var self =  this;

	if(!this.contracts[contractName]){
		return cb(new Error("A contract by " + contractName + " was not found"));
	}

	var structDef = this.contracts[contractName].SD;
	var contract = this.contracts[contractName].contract;

	var initSeq = structDef.initSeq;
	var tables = structDef.tables;
	var initCalls = structDef.initCalls;
	var secCalls = structDef.secCalls;

	//Now need to find the maximums for each key Run through the non-dependent keys first then
	//the dependent calls.

	//Non-dependent calls
	async.forEachOf(initCalls, function(keyarray, call, callback){
		contract[call].call(function(err, data){
			if (err) return callback(err);
			data = data.values; 

			//Unpack the max key values you got from this call
			for (var i = 0; i < keyarray.length; i++) {
				var key = keyarray[i];

				//This check can probably also be avoided by doing pre-processing of the abi 
				try{
					initSeq[key].max = initSeq[key].min + parseInt(data[initSeq[key].len.field]);
				} catch (err){
					return callback(err);
				}
			};
				
			return callback(null);
		})
	}, function(err){
		if(err) return cb(err);
		//Time to run the second round of keys
		async.forEachOf(secCalls, function(keysobj, call, callback){
			var keyarray = keysobj.keyarray;
			var dependent = keysobj.dependent;

			//loop through all dependent key values and make calls to function
			var indices = []
			for (var i = initSeq[dependent].min; i < initSeq[dependent].max; i++) {
				indices.push(i);
			};

			async.eachLimit(indices, parallelLimit, function(i, callback2){
				contract[call].call(i, function(err, data){
					if (err) return callback2(err);
					data = data.values;
					//Unpack the max key values you got from this call
					for (var j = 0; j < keyarray.length; j++) {
						var key = keyarray[j];
						if(!initSeq[key].max){
							initSeq[key].max = {};
						}
						initSeq[key].max[i] = initSeq[key].min + parseInt(data[initSeq[key].len.field]);
					};
					return callback2(null);
				})
			}, callback)
		}, function(err){
			if(err) return cb(err);

			fillTables(self, contract, contractName, tables, initSeq, cb)
		})
	})
}


function processField(output){
	var Pop = {};
	Pop.name = output.name;
	Pop.isString = false;
	Pop.isBool = false;

	switch(true){
		case /bytes/i.test(output.type):
			Pop.type = "VARCHAR(100)";
			Pop.isString = true;
			break;
		case /int/i.test(output.type):
			Pop.type = "INT";
			break;
		case /address/i.test(output.type):
			Pop.type = "VARCHAR(100)";
			Pop.isString = true;
			break;
		case /bool/i.test(output.type):
			Pop.type = "BOOLEAN";
			Pop.isBool = true;
			break;
		case /string/i.test(output.type):
			Pop.type = "TEXT";
			Pop.isString = true;
			break;
		default:
			throw new Error("Could not Identify return type: " + output.type);
	}
	return Pop;
}

function useOutput(output){
	// This might be expanded over time
	//Currently I only know that exists is a special name that can't be used
	if (output.name == 'exists'){
		return false;
	}

	return true;
}

function getFunc(contract, funcName){
	var funcDefs = contract.abi.filter(function(obj){return (obj.type == 'function' && obj.name == funcName)})

	if (funcDefs.length == 0) throw new Error("Function call is not unique: " + funcName);
	if (funcDefs.length > 1) throw new Error("Function call is not unique: " + funcName);
	if (!funcDefs[0].constant) console.log("Warning: The data retrieval function: " + funcName + " is not specified as constant. The Sql cache will only use calls but you might want to look into that.");

	return funcDefs[0];
}

function preprocess(contract, contractName, SD){
	// Take the structure definition file and parse it for errors
	// Then produce the initCalls and secCalls for table initialization.

	var NSD = {initSeq:{}, initCalls:{}, secCalls:{}, tables:{}};
	var seenKeys = {};
	var neededKeys = {};
	//Step 1 Check the tables
	if (!SD.tables) throw new Error("The structure Definition file does not have a \'tables\'' object");
	if (!SD.initSeq) throw new Error("The structure Definition file does not have a \'initSeq\'' object");
	
	NSD.initSeq = SD.initSeq;
	//Sanitize initSeq
	for (key in NSD.initSeq){
		if (!NSD.initSeq[key].min) NSD.initSeq[key].min = 0;
	}


	for (tabName in SD.tables){
		var table = SD.tables[tabName];

		// Sanitization of tables
		// This allows the keys fields to be left out.
		// If the table structure is not an object(just a string)
		// it is assumed to be the call

		if (typeof table == 'string') {
			// string should be the call
			table = {call: table} 
		}

		if (!table.call) throw new Error("The table definition \'" + tabName + "\' is missing \'call\' and could not be processed");

		if (!contract[table.call]) throw new Error("The table \'" + tabName + "s\' call function \'" + table.call + "\' does not appear in the contract.");

		var funcDef = getFunc(contract, table.call);

		if (!table.keys) {
			// Keys not provided -> fill them from abi
			table.keys = [];
			
			for (var i = 0; i < funcDef.inputs.length; i++) {
				table.keys.push(funcDef.inputs[i].name)
			};
		}

		//Mandatory structure
		if (!table.keys) throw new Error("The table definition \'" + tabName + "\' is missing either \'keys\' and could not be processed");

		//Check initialization sequences for all keys for this table are provided

		for (var i = 0; i < table.keys.length; i++) {
			if(!SD.initSeq[table.keys[i]]) throw new Error("The key \'" + table.keys[i] + "\'' is needed by " + tabName + " but does not have a method to initialize");
		};

		NSD.tables[tabName] = {};
		NSD.tables[tabName].call = table.call;
		NSD.tables[tabName].name = tabName;

		if (table.keys.length != 1 && table.keys.length != 2) throw new Error("The keys array for \'" + tabName + "\' has either too many or too few members (Max is 2)");

		//Copy over keys but evaluate them to ensure if second keys is dependent then it is dependent on the first key
		if(table.keys.length != 1 && table.keys.length != 2){
			throw new Error("A table can only have either one or two keys please check the table definition for table: " + tabName)
		}

		//Need to check all keys are available


		if (SD.initSeq[table.keys[0]].dependent){
			throw new Error("A table can not have its first key to a call be dependent. The offending key is: " + table.keys[0] + " which is the first key for table: " + tabName)
		}

		if (table.keys.length == 2 && SD.initSeq[table.keys[1]].dependent && SD.initSeq[table.keys[1]].dependent != table.keys[0]){
			throw new Error("A table's second key can not be dependent on a key other then its first key. the offending key is: " + table.keys[2] + " which is the second key for table: " + tabName)
		}

		//Fill in this table's fields by reading the abi

		//Check that the inputs and keys match
		if(funcDef.inputs.length != table.keys.length){
			throw new Error("The row retrieval operation: " + table.call + " has a mismatch in number of variables required and provided. Need: " + funcDef.inputs.length + " Provided: " + table.keys.length)
		}

		// Need to check that input types are from the list of valid input types
		for (var j = 0; j < funcDef.inputs.length; j++) {
			var type = funcDef.inputs[j].type;

			var validType = (/int/i.test(type) || /string/i.test(type) || /address/i.test(type) || /bytes\d+/i.test(type))
			
			if (! validType){
				throw new Error("The row retrieval operation " + table.call + " has an invalid type input: " + funcDef.inputs[j].name)
			}
		};

		NSD.tables[tabName].keys = table.keys;
		
		//Improved handling usage of the inputs field should be phased in in favour of keys
		var inputs = funcDef.inputs;
		NSD.tables[tabName].inputs = [];
		for (var i = 0; i < table.keys.length; i++) {
			// Replace the names from the contract with the ones in the struct def
			input = {name: table.keys[i], type: inputs[i].type};
			// Determine if this input needs to be quoted
			// inputs[i] = processField(inputs[i])
			NSD.tables[tabName].inputs.push(processField(input))
		};

		//Process Outputs
		var tabfields = [];
		for (var i = 0; i < funcDef.outputs.length; i++) {
			var output = funcDef.outputs[i];

			//Determine if we should make a column for this output
			if(useOutput(output)){
				tabfields.push(processField(output));
			}

		};

		NSD.tables[tabName].fields = tabfields;
	}

	//Step 2 Check the initialization sequence

	var indkeys = {}
	var depkeys = []
	//This processes which calls need to be made and what keys can be retrieved from them.
	for (var key in SD.initSeq){
		var ind = SD.initSeq[key];

		if(!ind.len) throw new Error("The index \'" + key + " does not have a len field");
		var len = ind.len;

		//Check that the call is valid
		if (!contract[len.call]) throw new Error("The index \'" + key + "s\' length fetch (call) function \'" + len.call + "\' does not appear in the contract.");

		var call = len.call;

		if (ind.deserialize) {
			if (!contract[ind.deserialize]) {
				throw new Error("The index \"" + key + "\'s\" deserialize (call) function \'" + ind.deserialize + "\' does not appear in the contract.")
			}

			// Check that the deserialize function has a return feild "keyValue"

			var funcDef = getFunc(contract, ind.deserialize)
			if (funcDef.outputs.length !=1) throw new Error("The deserialization call " + ind.deserialize + " has more then one return value.");				
		} 


		//Check that the specified field is one of the outputs of the call.
		funcDef = getFunc(contract, len.call);
		if (!funcDef.outputs.some(function(output){return (output.name == len.field)})) throw new Error("The initialization call " + len.call + " does not have required field " + ind.field);

		//Ensure the type of the init seq return fields are uints
		if (! /uint/i.test(funcDef.outputs.filter(function(output){return (output.name == len.field)})[0].type)) throw new Error("Initialization sequence calls are required to have fields which are uints. The call: " + len.call + " is getting field: " + len.field + " which is of a non-uint type")

		if(!ind.dependent){
			// If index is independent then add it to the initial calls list
			if(!NSD.initCalls[call]){
				NSD.initCalls[call] = [];
			}

			indkeys[key] = true;
			NSD.initCalls[call].push(key);
		} else {
			// If the index is dependent then:
			// Check the index it is dependent on exists
			if(!SD.initSeq[ind.dependent]) throw new Error("The dependancy \'" + ind.dependent + "\' for index \'" + key + "\' does not have an initialization definition.")
			// Add this call to the list of secondary calls
			if(!NSD.secCalls[call]){
				NSD.secCalls[call] = {keyarray:[], dependent: ind.dependent};
			}
			// Check for conflicting dependencies (a single call can't be dependent on multiple other indicies)
			if(NSD.secCalls[call].dependent != ind.dependent) throw new Error("There are conflicting dependancies for the call \'" + call + "\' and key \'" + key);

			depkeys.push(key);
			NSD.secCalls[call].keyarray.push(key);
		}
	}

	//Check for circular dependancies
	for (var i = 0; i < depkeys.length; i++) {

		if(!indkeys[SD.initSeq[depkeys[i]].dependent]){
			throw new Error("The dependent key " + depkeys[i] + " has is not dependent on any provided independent keys. Needed: " + SD.initSeq[depkeys[i]].dependent)
		}

	};

	return NSD;
}


sqlcache.prototype.addUpdateListeners = function(contractName){
	var self = this;
	var contract = this.contracts[contractName].contract;

	var sub = function(err, subObj){
		self.contracts[contractName].subObj.push(subObj);
	};

	var updateHandle = function(err, eventData){
		if (err) {
			console.log("An error occurred in the event handler");
			console.log(err);
		} else {
			var name = eventData.args.name.toString();
			var key1 = eventData.args.key1;
			var key2 = eventData.args.key2;

			self.update(contractName, name, key1, key2, function(err){
				self.emitter.emit('update', {"table":name, "keys":[key1, key2]})
				if(err) throw err;
			});
		}
	}

	var removeHandle = function(err, eventData){
		if (err) {
			console.log("An error occurred in the event handler");
			console.log(err);
		} else {
			var name = eventData.args.name.toString();
			var key1 = eventData.args.key1;
			var key2 = eventData.args.key2;

			self.remove(contractName, name, key1, key2, function(err){
				self.emitter.emit('remove', {"table":name, "keys":[key1, key2]})
				if(err) throw err;
			});
		}
	}

	var supportedEvents = [
		"SS", "US", "IS", "BS", "AS",
		"SU", "UU", "IU", "BU",	"AU",
		"SI", "UI", "II", "BI", "AI",
		"SB", "UB", "IB", "BB", "AB",
		"SA", "UA", "IA", "BA", "AA"
	]

	//Attach a listener for the update event(only one event)
	contract.update(sub, updateHandle);

	if (contract.remove) contract.remove(sub, removeHandle);

	// Turn the multiple events into a single event
	for (var index in supportedEvents){
		uevent = "update" + supportedEvents[index];
		revent = "remove" + supportedEvents[index];
		if (contract[uevent]) contract[uevent](sub, updateHandle);
		if (contract[revent]) contract[revent](sub, removeHandle);
	}
}


sqlcache.prototype.addContract = function(contract, structDefRaw, contractName, cb){

	var self = this;
	this.contracts = {};

	if(typeof contractName == 'function'){
		cb = contractName;
		contractName = contract.address;
	}

	if(!contract.update){
		return cb(new Error("The contract provided does not have the update event used for all table updates"))
	}

	//Pre process structDef for integrity and sequencing
	var structDef = {};
	try{
		structDef = preprocess(contract, contractName, structDefRaw);
	} catch (err) {
		return cb(err);
	}
	

	this.contracts[contractName] = {SD: structDef, contract: contract, subObj:[]}

	//create tables, Table name is <contractName><tablename>
	for (var key in structDef.tables){
		var table = structDef.tables[key];
		//Create table

		//sql table creation command

		//TODO add in default values
		cmd = "CREATE TABLE " + table.name + "(";

		pkeys = "PRIMARY KEY (";
		for (var i = 0; i < table.inputs.length; i++) {
			if(i!=0) {
				pkeys += ", ";
				cmd += ", ";
			}
			pkeys += table.inputs[i].name;
			cmd += table.inputs[i].name + " " + table.inputs[i].type;
		};
		pkeys += ")"

		for (var i = 0; i < table.fields.length; i++) {
		 	var field = table.fields[i];
		 	cmd += ", " + field.name + " " + field.type 
		 	if(field.isString){
		 		cmd += " DEFAULT \'\'"
		 	} else if (field.isBool){
		 		cmd += " DEFAULT 0"
		 	} else {
		 		cmd += " DEFAULT 0"
		 	}
		}; 
		cmd += ", " + pkeys + ")"
		// console.log(cmd)
		this.db.run(cmd, function(err){
			if(err) throw new Error("An Error occured while attempting to create the table " + table.name + " with command " + cmd);
		});
	}

	this.addUpdateListeners(contractName)

	cb(null)
}

sqlcache.prototype.update = function(contractName, name, key1, key2, cb){
	var self = this;

	// console.log("Updating: " + contractName + " : " + name + " : " + key1 + " : " + key2)

	if(!this.contracts[contractName]){
		return cb(new Error("A contract by " + contractName + " was not found"));
	}

	if(typeof key2 == 'function'){
		cb = key2;
		key2 = null;
	}


	var structDef = this.contracts[contractName].SD;
	var contract = this.contracts[contractName].contract;

	if(!structDef.tables[name]){
		return cb(new Error("A table with name " + name + " was not found"));
	}


	var table = structDef.tables[name];
	var db = this.db;
	//Now the meat
	//Call contract to get new data
	var processReturn = function(err, output, callback){
		if(err) {
			callback(err)
		}

		output = output.values;

		self.set(contractName, name, output, key1, key2, callback)
	}

	if(table.keys.length == 1){
		contract[table.call].call(key1, function(err, output){processReturn(err, output, cb)})
	} else if (table.keys.length == 2){
		contract[table.call].call(key1, key2, function(err, output){processReturn(err, output, cb)})
	} else {
		return cb(new Error("TO MANY KEYS"))
	}
}


sqlcache.prototype.remove = function(contractName, name, key1, key2, cb){
	var self = this;

	if(!this.contracts[contractName]){
		return cb(new Error("A contract by " + contractName + " was not found"));
	}

	var structDef = this.contracts[contractName].SD;
	var contract = this.contracts[contractName].contract;

	if(!structDef.tables[name]){
		return cb(new Error("A table with name " + name + " was not found"));
	}

	var table = structDef.tables[name];
	var db = this.db;

	//get the number of required keys from the table definition
	var tkflag = (table.keys.length == 2);

	//If two keys are needed then failure of callback to be a function is a fatal error
	if(tkflag && typeof callback != "function"){
		throw new Error("Callback function not provided")
	}

	//If not two keys required and key2 is a function we normalize the input so the callback is assumed to be given in key2
	if(!tkflag && typeof key2 == "function"){
		callback = key2;
		key2 = null;
	}

	//At this point the callback should be a function if not its a fatal error
	if(typeof callback != "function"){
		throw new Error("Callback function not provided")
	}

	// Where Statement construction
	var where = " WHERE " + table.inputs[0].name + "=" + formatField(key1, table.inputs[0])
	if (tkflag) where += " AND " + table.inputs[1].name + "=" + formatField(key2, table.inputs[1]);

	var del = "DELETE from " + table.name + where;

	db.run(del);
	return cb(null);
}

sqlcache.prototype._get = function(contractName, name, key1, key2, callback){
	var self = this;

	var tkflag = false;
	if(typeof key2 == "function"){
		callback = key2
		key2 = null
	}

	if (key2) tkflag = true;
	//This function will perform look ups in the table based on values for key1 and optionally key2

	if(!this.contracts[contractName]){
		return cb(new Error("A contract by " + contractName + " was not found"));
	}

	var structDef = this.contracts[contractName].SD;

	if(!structDef.tables[name]){
		return cb(new Error("A table with name " + name + " was not found"));
	}

	var table = structDef.tables[name];
	var db = this.db;

	// Where Statement construction
	var where = " WHERE " + table.inputs[0].name + "=" + formatField(key1, table.inputs[0])
	if (tkflag) where += " AND " + table.inputs[1].name + "=" + formatField(key2, table.inputs[1]);

	var get = 'SELECT * from ' + table.name + where;

	db.get(get, callback)
}

sqlcache.prototype.set = function(contractName, name, data, key1, key2, callback){
	var self = this;

	//This function will perform look ups in the table based on values for key1 and optionally key2

	if(!this.contracts[contractName]){
		return cb(new Error("A contract by " + contractName + " was not found"));
	}

	var structDef = this.contracts[contractName].SD;

	if(!structDef.tables[name]){
		return cb(new Error("A table with name " + name + " was not found"));
	}

	var table = structDef.tables[name];
	var db = this.db;

	//get the number of required keys from the table definition
	var tkflag = (table.inputs.length == 2);

	//If two keys are needed then failure of callback to be a function is a fatal error
	if(tkflag && typeof callback != "function"){
		throw new Error("Callback function not provided")
	}

	//If not two keys required and key2 is a function we normalize the input so the callback is assumed to be given in key2
	if(!tkflag && typeof key2 == "function"){
		callback = key2;
		key2 = null;
	}

	//At this point the callback should be a function if not its a fatal error
	if(typeof callback != "function"){
		throw new Error("Callback function not provided")
	}
	//Construct the sqlite statements

	function formatField(value, field){
		if (field.isString){
			out = "\'" + value + "\'"
		} else {
			out = value.toString();
		}
		return out;
	}

	// Where Statement construction
	var where = " WHERE " + table.inputs[0].name + "=" + formatField(key1, table.inputs[0])
	if (tkflag) where += " AND " + table.inputs[1].name + "=" + formatField(key2, table.inputs[1]);

	//Slightly more involved

	var cols = "(" + table.inputs[0].name + (tkflag ? ", " + table.inputs[1].name : "");
	var vals = "VALUES ("  + formatField(key1, table.inputs[0]) + (tkflag ? ", " + formatField(key2, table.inputs[1]) : "");

	var ins = "INSERT into " + table.name;
	var upd = "UPDATE " + table.name + " SET ";

	var fflag = true;
	for (var i = 0; i < table.fields.length; i++) {
	 	var field = table.fields[i];

	 	if(data[field.name]){
	 		if(!fflag) upd +=", ";
	 		fflag = false;
	 		if(field.isString){
	 			cols += ", " + field.name;
			 	vals += ", \'" + data[field.name] +"\'";
			 	upd += field.name + "=\'" + data[field.name] + "\'";
		 	} else if(field.isBool){
		 		cols += ", " + field.name;
			 	vals += ", " + (data[field.name] == true ? 1 : 0) +"";
			 	upd += field.name + "=\'" + (data[field.name] == true ? 1 : 0) + "\'";
		 	} else {
		 		cols += ", " + field.name;
			 	vals += ", " + data[field.name];
			 	upd += field.name + "=" + data[field.name]
		 	}
	 	}	
	}; 

	cols += ")"
	vals += ")"

	ins += " " + cols + " " + vals;
	upd += where;


	var delflag = false;

	if(!data || (data.hasOwnProperty('exists') && data.exists == false)){
		var del = "DELETE from " + table.name + where;
		delflag = true;
	}
	//Check if an entry already exists and then either insert update or delete
	db.get("SELECT * from " + table.name + where, function(err, row){
		if(err) callback(err);
		if(row === undefined && !delflag){
			// console.log(ins)
			db.run(ins, callback);
		} else if (!delflag){
			// console.log(upd)
			db.run(upd, callback);
		} else {
			// console.log(del)
			db.run(del, callback);
		}
	})
}

