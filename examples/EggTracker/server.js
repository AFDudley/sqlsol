var sqlcache = require(__dirname + "/../../lib/sqlcache");
var createDb = require(__dirname + '/../createDb');
var fs = require ('fs-extra');
var erisContracts = require('eris-contracts');
var crypto = require('crypto');
var async = require('async');
var moment = require('moment');
var restify = require('restify');

var name = "Egg Tracker Example Server"
var port = 1212;


var dbUrl, account, contractManager, contract;

var eggsBin = fs.readFileSync(__dirname + "/contracts/eggtracker.bin");
var eggsAbi = fs.readJSONSync(__dirname + "/contracts/eggtracker.abi");
var eggStruct = fs.readJSONSync(__dirname + "/eggStruct.json")
var eggsContract;
var eggcache;


//Set up a temporary chain for example purposes, deploy a contract to said chain
//and start up the sql cache
console.log("Creating DB...")
createDb().spread(function (url, validator) {
	console.log("DB created!")
	console.log(url)
	dbUrl = url;

	account = {
		address: validator.address,
		pubKey: validator.pub_key,
		privKey: validator.priv_key
	};

	contractManager = erisContracts.newContractManagerDev(dbUrl, account);

	var contractFactory = contractManager.newContractFactory(eggsAbi);
	contractFactory.setOutputFormatter(erisContracts.outputFormatters.jsonStrings)

	console.log("Deploying Contract...")
	contractFactory.new({data: eggsBin}, function (err, newContract) {
		if (err) throw err;
		console.log("Contract deployed!")
		eggsContract = newContract;

		//Set up egg cache
		console.log("Creating and Initializing SQL Cache")
		eggcache = new sqlcache(':memory:', account)

		//The egg cache has an event emitter object which will emit 'update' and 'remove' events
		//if you should wish to listen for them. The event is triggered only after the table is updated
		eggcache.emitter.on('update', function(data){
			console.log("Update!")
			console.log(data)
		})

		//Adding the contract to the cache is what allows the cache to listen for
		//update events, its also when all the tables are created (BUT NOT initialized)
		//The eggstruct is formatted to describe what tables exist and what keys they have
		//as well as instructions for intializing the tables.
		eggcache.addContract(eggsContract, eggStruct, "eggtracker", function(err){
			if(err) throw err;

			//Population of the tables. I'm not 100% certain of any circumstances where
			//you would not want to initialize. but it could happen i guess
			eggcache.initTables("eggtracker", function(err){
				if(err) throw err;
				console.log("SQL cache set up!")
				startServer();
			});
		})
	});
})


//STAR OF THE SHOW
//This uses the sql cache to make queries to retrieve the information of interest.
//Note: Any valid node sqlite3 query can be made
//See the API documentation here: https://github.com/mapbox/node-sqlite3/wiki/API
//The cache.db object is a nodesql database. so queries can be made of it
//You should also be able to make queries directly to the cache object as if it were the db object


function getEggData(eggid, cb){
	console.log(eggid)
	//Get the core eggid data
	eggcache.db.get('Select * from eggs where eggid = ?', eggid, function(err, eggdata){
		if (err) return cb(err);
		if (!eggdata) return cb(null, {code:404, msg: "Egg not Found\n"});

		//An egg's history is stored in another table here we get all history events for eggid
		//and sort by the event id
		eggcache.db.all('Select * from history where eggid = ? order by eventid', eggid, function(err, rows){
			if (err) return cb(err);
			if (!rows) rows = [];

			eggdata['history'] = rows;

			//Finally we access the users table to retrieve the "real" name of the user associated with the egg's owner address
			eggcache.db.get('select * from users where addr = ?', eggdata.owner, function(err, userData){
				if (err) return cb(err);
				eggdata["ownername"] = userData.name;
				return cb(null, null, eggdata);
			})
		})
	})
}




//Wrappers around transactions function for nicer formatting

function createEgg(description, secretHash, callback) {
	eggsContract.createEgg.sendTransaction(description, secretHash, function(error, result){
		if (error) return callback(error);
		return callback(null, parseInt(result.values.error), parseInt(result.values.newID));
	});

}

function transferEgg(eggID, newOwner, callback) {
	eggsContract.transferEgg(eggID, newOwner, function(error, result){
		if (error) return callback(error);
		return callback(null, result.values.error);
	});
}

function claimEgg(eggID, secret, newSH, callback) {
	eggsContract.claimEgg(eggID, secret, newSH, function(error, result){
    	if (error) return callback(error);
		return callback(null, result.values.error);
	});
}




//Create a restify server
function startServer(){
	console.log("Starting server...")

	var server = restify.createServer();
	server.use(restify.queryParser());
	server.use(restify.bodyParser({mapParams: true, mapFiles: true}));

	//JSON returning endpoint for... hooking into other things?
	server.get('/eggs/:eggid', function(req, res, next){

		getEggData(req.params.eggid, function(err, ecode, eggdata){
			if(err){
				res.send(500, err)
				return next();
			}

			if(ecode){
				res.send(ecode.code, ecode.msg)
				return next()
			}

			res.json(200, eggdata)
			return next();

		})
	})

	//Pretty output endpoint returns HTML for browser
	server.get('/pp/:eggid', function(req, res, next){

		getEggData(req.params.eggid, function(err, ecode, eggdata){
			if(err){
				res.send(500, err)
				return next();
			}

			if(ecode){
				res.send(ecode.code, ecode.msg)
				return next()
			}
			console.log(eggdata)
			body = prettyPrint(req.params.eggid, eggdata)
			res.writeHead(200, {
				'Content-Length': Buffer.byteLength(body),
				'Content-Type': 'text/html'
			});
			res.write(body);
			res.end();
			return next();

		})
	})

	//Pretty output endpoint returns formatted string data for commandline output 
	server.get('/ppcmd/:eggid', function(req, res, next){
		getEggData(req.params.eggid, function(err, ecode, eggdata){
			if(err){
				res.send(500, err)
				return next();
			}

			if(ecode){
				res.send(ecode.code, ecode.msg)
				return next()
			}

			body = prettyPrintCMD(req.params.eggid, eggdata)
			res.writeHead(200, {
				'Content-Length': Buffer.byteLength(body),
				'Content-Type': 'text/html'
			});
			res.write(body);
			res.end();
			return next();

		})
	})


	//Endpoint for creating a new egg with a random length history
	//Only transfers from self to self for simplicity.
	server.get('/secret/:desc', function(req, res, next){ //This should be a POST end point but I'm lazy BAD FORM

		var hash = crypto.createHash('sha256');
		var secretBuf = crypto.randomBytes(32);
		hash.update(secretBuf)
		var secret = secretBuf.toString('hex')
		var secretHash = hash.digest().toString('hex');

		var EGGY;

		var histLen = getRandomInt(2, 9);

		createEgg(req.params.desc, secretHash, function(err, ecode, ID){
			if (err) res.send(500, err)

			EGGY = ID;

			var claim = false;
			var count = 0;
			async.whilst(
			    function () { return (count <= histLen); },
			    function (cb) {
			    	count ++;

			    	if(claim){
			    		claimEgg(EGGY, secret, secretHash, function(err, ecode){
							if (err) cb(err);
							claim = false;
							cb(null)
						})
			    	} else {
			    		transferEgg(EGGY, account.address, function(err, ecode){
							if (err) cb(err);
							claim = true;
							cb(null)
						})
			    	}
			    },
			    function (err) {
			    	if (err) res.send(500, err)
			    	res.send(200, "Random egg created with ID: " + EGGY.toString() + "\n")
			    	return next();
			    }
			);
		})

	})

	server.listen(port);

	console.log("");
	console.log("Welcome to: " + name + " on port " + port.toString());
	console.log("");

	test = '07B38CC813F208F59E5CB3C1E10D473F6076BA27'
	eggcache.db.get('select * from users where address = ?', test, function(err, data){
		console.log(err)
		console.log(data)
	})

}



//These are just stupid output formatting functions
//So things look pretty-ish
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}


//You could probably do this better then me.

function prettyPrint(eggid, eggdata){
	//You could put some real HTML in here if you would like
	//I suck at HTML so this is basically all i could manage
	str = "<html><body>"
	str += "<h2>EGG REPORT</h2><br>";
	str += "<hr>"
	str += "Egg ID:\t" + eggid + "<br>";
	str += "Owner:\t" + eggdata.ownername + "<br>";
	str += "Address:\t" + eggdata.owner + "<br>";
	str += "Status:\t" + eggdata.claimed ? "Claimed<br>" : "Unclaimed<br>"
	str += "Origin Date:\t" + moment.unix(parseInt(eggdata.originDate)).format('DD-MM-YYYY') + "<br>";
	str += "Description:\t" + eggdata.desc + "<br>";
	str += "<hr>"
	str += "<h3>Tracking History</h3>"
	str += "<hr>"
	str += "Event:\t\t| Time:\t\t\t|By:<br>"

	for (var i = 0; i < eggdata.history.length; i++) {
		estr = ""
		evt = eggdata.history[i];
		if (evt.etype == 1){
			estr += "Created | "
		} else if (evt.etype == 2) {
			estr += "Transferred | "
		} else if (evt.etype == 3) {
			estr += "Claimed | "
		}

		estr += moment.unix(parseInt(evt.time)).format('DD-MM-YYYY') + " | "

		estr += evt.actor
		str += estr + "<br>"
	};

	str += "<hr>";
	str += "</body></html>"
	return str
}

function prettyPrintCMD(eggid, eggdata){
	//You could put some real HTML in here if you would like
	//I suck at HTML so this is basically all i could manage
	str = "\n\n"
	str += "===============================================================================\n"
	str += "EGG REPORT\n";
	str += "===============================================================================\n"
	str += "Egg ID:\t" + eggid + "\n";
	str += "Owner:\t\t" + eggdata.ownername + "\n";
	str += "Address:\t" + eggdata.owner + "\n";
	str += "Status:\t\t" + (eggdata.claimed ? "Claimed\n" : "Unclaimed\n")
	str += "Origin Date:\t" + moment.unix(parseInt(eggdata.originDate)).format('DD-MM-YYYY') + "\n";
	str += "Description:\t" + eggdata.desc + "\n";
	str += "===============================================================================\n"
	str += "Tracking History\n"
	str += "===============================================================================\n"
	str += "Event:\t\t| Time:\t\t|By:\n"

	for (var i = 0; i < eggdata.history.length; i++) {
		estr = ""
		evt = eggdata.history[i];
		if (evt.etype == 1){
			estr += "Created\t\t|"
		} else if (evt.etype == 2) {
			estr += "Transferred\t|"
		} else if (evt.etype == 3) {
			estr += "Claimed\t\t|"
		}

		estr += moment.unix(parseInt(evt.time)).format('DD-MM-YYYY') + "\t| "

		estr += evt.actor
		str += estr + "\n"
	};

	str += "===============================================================================\n"
	str += "\n\n"
	return str
}


