#! /usr/bin/env node

var path = require('path');
var fs = require('fs-extra');
var argsparser = require('shell-quote').parse;
var lineparser = require('lineparser');
var mini = require('minimist');
var async = require('async');
var crypto = require('crypto');
var colours = require('colors');

var sc = require('../lib/sqlcache.js');
var erisContracts = require('eris-contracts');

var home = process.env.HOME;
var root = path.join(home, '.eris', 'sqlsol');
var mpath = path.join(root, 'models');



/**
 * The terminal command parsing function
 * @param {EggTerminal) ctx - The EggTerminal instance as context.
 */
function parseline(line){
    //TODO smarter splitting to account for quoted strings
    args = line.split(/\b\s+\b/)
    r = {args:[],
        parameters:{},
        raw:line}
    for (var i = 0; i < args.length; i++) {
        if (args[i].match(/\s*[=]\s*/)){
            //parameter
            param = args[i].split(/\s*[=]\s*/)
            r.parameters[param[0]] = param[1]
        } else {
            //just an arg
            if (args[i] != undefined && args[i] != '') r.args.push(args[i]);
        }
    };
    return r;
}

function recursiveMatch(options, args, pos){
    if(!pos) pos=0;

    //check we can even have args to compare
    if(args.length <= pos) return null;

    var filtered = options.filter(function(e, i){
        if (e[0].length <= pos) return false;
        cmdReg = new RegExp(e[0][pos])
        return cmdReg.test(args[pos], 'i');
    });

    if (filtered.length == 0){
        //No matches found. Use best match found from level above
        return null;
    } else {
        //Go down one level
        var further = recursiveMatch(filtered, args, pos+1)
        if (!further) {
            //Deeper search returned no results construct actual result from this level
            //This means filtering out all matches that are partial
            fulls = filtered.filter(function(e,i){return (e[0].length == pos+1);});
            parts = filtered.filter(function(e,i){return (e[0].length > pos+1);});
            return {l:pos, s:fulls, p:parts}
        } else {
            //Pass back the result
            return further;
        }
    }
}

function processArgs(tokens, cmd) {

    //Add positional arguments to parameters using cmd specification
    
}

function makeparser(meta){
    //Clean meta
    for (var i = 0; i < meta.usages.length; i++) {
        if (!Array.isArray(meta.usages[i][0])){
            meta.usages[i][0] = [meta.usages[i][0]]
        }
    };

    return function(line, cb){
        // console.log(meta)
        //Break up line into tokens
        tokens = parseline(line);

        //Will maximize the number of matched arguments
        var matches = recursiveMatch(meta.usages, tokens.args);

        // console.log(selected)
        if (!matches) return cb(new Error("Command Not known"));

        if (matches.s.length == 0) return cb(new Error("Complete command could not be matched"))

        // tokens.args = tokens.args.slice(matches.l+1)

        //TODO smarter selection
        var match = matches.s[0]

        //TODO checking that all required arguments are provided of default values substituted

        try {
            tokens = processArgs(tokens, match)
        } catch (e) {
            return cb(e);
        }

        matches.s[0][4].call(this, tokens, cb);
    }
}



function cli(){
    //For tracking sqlsol instances
    this.currentDB = null
    this.runningDBs = {};

    var meta = {
        program: "sqlsol-cli",
        name: "The sqlsol command line/ terminal interface",
        version: "0.0.1",
        subcommands: ['create', 'drop', 'add', 'modify', 'query', 'show', 'help'],
        options: {
            flags: [
                // -$- short_name, name, description -$-
                [ 'h', 'help', 'print program usage' ],
                [ 'v', 'verbose', 'print detailed information' ]
            ],
            parameters: [
                // -$- short_name, name, description, default_value -$-
                // ['t', 'target', 'The target bilateral command', '590244C2F0D8A3D09B68802B4A206C842FA0B864']
                // ['t', 'test', 'test parameter', 'purple people eater']
            ]
        },
        usages: [
            // -$- subcommand, options, positional-arguments, description, handler -$-
            ['create', null, null, 'Provision a tag with provided json file.', this.create],
            ['drop', null, null, 'Register egg carton to eggchain.', this.drop],
            ['use', null, null, 'Use a database', this.use],
            ['modify', null, null, 'Modify things', this.modify],
            ['query', null, null, 'Submit sql query', this.query],
            ['show', null, null, 'Show stuff', this.show],
            ['help', null, null, 'help', this.help],
            ['.*', null, null, 'help', this.query]
        ]
    };

    // this.optparser = lineparser.init(meta);
    this.parser = makeparser(meta);
    this.prompt = require('prompt-sync')({
        sigint: true,
        history: require('prompt-sync-history')(path.join(root,'.prompt_history.txt'), 100)
    });
}

cli.prototype.terminal = function() {
    var self = this;
    var cmdline = this.prompt('>> ', 'help');
    self.prompt.history.save();

    this.parser(cmdline, function (err) {
        if (err) console.log(err)
        self.terminal(); //This is not good form. endless recursion. call stack will get too big.
    });
}

function fileexists(filepath) {
    try {
        return fs.statSync(filepath).isFile();
    }
    catch (e) {

        // Check exception. If ENOENT - no such file or directory ok, file doesn't exist. 
        // Otherwise something else went wrong, we don't have rights to access the file, ...
        if (e.code != 'ENOENT') throw e;

        return false;
    }
}

cli.prototype.prepare = function() {
    var self = this;
    //Prepare global folder structure
    console.log("Preparing...")

    paths = [
        '.eris',
        root,
        path.join('.eris', 'sqlsol', 'models')
    ]

    for (var i = 0; i < paths.length; i++) {
        try {
            fs.mkdirSync(path.join(home, paths[i]));
        } catch (e) {}
    };

    //Need models name file too

    try {
        fs.accessSync(path.join(home, '.eris', 'sqlsol', 'models', 'names.json'))
    } catch(e) {
        //Make it.
        fs.writeJSONSync(path.join(home, '.eris', 'sqlsol', 'models', 'names.json'), {})
    }
    

}

function dobetter(r){
    var temp = mini(r.args);
    r.args = temp._;
    for (key in temp){
        if(key != '_'){
            if (typeof temp[key] == 'boolean'){
                r.flags[key] = temp[key];
            } else {
                r.parameters[key] = temp[key];
            }
        }
    }
    return r;
}

function getContract(CM, address, abi){
    var contractFactory = CM.newContractFactory(abi);
    contractFactory.setOutputFormatter(erisContracts.outputFormatters.jsonStrings)
    return contractFactory.at(address);
}

function resolveModel(modelName){
    //First check if its a in the names.json
    names = fs.readJSONSync(path.join(mpath, 'names.json'))
    rname = modelName;
    if (names[modelName]){
        rname = names[modelName];
    }

    //Now check that the needed model exists
    if(!fileexists(path.join(mpath, rname))){
        throw new Error("Could not find model file: " + rname);
    }

    return fs.readJSONSync(path.join(mpath, rname));
}

function constructModel(abipath, SDpath, cb){
    if(!fileexists(abipath)){
        return cb(new Error("The abi file path provided could not be found"))
    }

    if(!fileexists(SDpath)){
        return cb(new Error("The structure definition file path provided could not be found"))
    }

    try{
        abi = fs.readJSONSync(abipath);
        structDef = fs.readJSONSync(SDpath);
    } catch (e) {
        return cb(e);
    }

    model = {}
    model.abi = abi;
    model.structDef = structDef;

    return model;
}

function nameExists(name){
    var names = fs.readJSONSync(path.join(mpath, "names.json"));
    return (names[name] != undefined);
}

function getModelHash(model){
    var hashr = crypto.createHash('sha256');
    hashr.update(JSON.stringify(model));
    return hashr.digest('hex').slice(0,10);
}

function writeModel(model, name){
    var hash = getModelHash(model);
    fs.writeJSONSync(path.join(mpath, hash), model)

    if (name) {
        var names = fs.readJSONSync(path.join(mpath, "names.json"))
        names[name] = hash;
        fs.writeJSONSync(path.join(mpath, "names.json"), names);
    }

    return hash;
}

cli.prototype.addContractToDB = function(dbName, cName, address, model, modelid, cb){
    if (!this.runningDBs[dbName]) return cb(new Error("DB \'" + dbName + "\' not running"));
    var thisDB = this.runningDBs[dbName];

    var contract = getContract(thisDB.CM, address, model.abi);
    thisDB.contractModels[cName] = {address:address, model:modelid};
    thisDB.db.addContract(contract, model.structDef, cName, cb);
}

cli.prototype.removeContractFromDB = function(dbName, cName, cb){
    //TODO implement sqlcache level removal of contracts
    if (!this.runningDBs[dbName]) return cb(new Error("DB \'" + dbName + "\' not running"));
    var thisDB = this.runningDBs[dbName];
    delete thisDB.contractModels[cName];
    // thisDB.db.removeContract(cName, cb);
    return cb(null);
}

cli.prototype.create = function(r, token){
    var self = this;
    console.log("CREATE")
    r = dobetter(r);

    if (/database/i.test(r.args[0])){
    // create database name --account/ --address --privkey --edb
        console.log('database')

        if(!r.parameters['edb']){
            return token(new Error("edb = <URL> is not optional"))
        }

        if(!r.parameters['account'] && !(r.parameters['address'] && r.parameters['privKey'])){
            return token(new Error("One of account = <account.json> or address = <address> and privKey = <privKey> must be provided"))
        }

        //TODO do better checks that this works (file exists fields aren't null)
        account = {};
        if(r.parameters['account']){
            accountRaw = fs.readJSONSync(r.parameters['account']); 
            account.address = accountRaw.address;
            account.privKey = accountRaw.privKey || accountRaw.priv_key[1];
        } else {
            account.address = r.parameters['account'];
            account.privKey = r.parameters['privKey'];
        }

        if (!/\:\/\//.test(r.parameters['edb'])) {
            edbUrl = "http://" + r.parameters['edb']
        } else {
            edbUrl = r.parameters['edb'];
        }

        //Implement the database file creation
        DBjson = {
            "name": r.args[1],
            "account": account,
            "erisdbURL": edbUrl,
            "contracts": {}
        }

        this.startUpDB(DBjson, function(err){
            if(err) return token(err);
            self.saveDB(r.args[1], token, true)
        })

    } else if (/contract/i.test(r.args[0])){

        // Load current DB
        if (!this.currentDB){
            return token(new Error("No database in use"));
        } 

        // create contract name  --model/ --abi --struct --address
        console.log('contract')

        if(!r.args[1]) return token(new Error("Contract name not provided"));
    
        var model;
        if (r.parameters['model']){
            model = resolveModel(r.parameters['model'])
            id = r.parameters['model'];
        } else if (r.parameters['abi'] && r.parameters['struct']) {
            model = constructModel(r.parameters['abi'], r.parameters['struct'])
            id = writeModel(model);
        } else {
            return token(new Error("Niether --model or --abi and --struct parameters passed"))
        }

        if (!r.parameters['address']) {
            return token(new Error("--address not provided"));
        }

        this.addContractToDB(this.currentDB, r.args[1], r.parameters['address'], model, id, function(err){
            if(err) return token(err);
            //If successful then save
            self.saveDB(self.currentDB, token);
        })

    } else if (/model/i.test(r.args[0])){
    // create model name --abi --struct
        console.log('model')
        //Check if it already exists. If so require drop to be run first

        var model;

        if (r.parameters['abi'] && r.parameters['struct']) {
            model = constructModel(r.parameters['abi'], r.parameters['struct'])
        } else {
            return token(new Error("Niether --model or --abi and --struct parameters passed"))
        }

        if (r.parameters['name'] && nameExists(r.parameters[name])){
            return token(new Error("Name already exists. Drop model before creating one with the same name"))
        }

        if (r.parameters['name']){
            writeModel(model, r.parameters['name']);
        } else {
            writeModel(model);
        }

        return token(null);
    } else {
        return token(new Error("Unrecognized keyword: " + r.args[0]))
    }
}

cli.prototype.loadDB = function(dbName, cb){
    var dbpath = path.join(root, dbName + ".json")

    // Check that the path is not outside the root
    if(/..\//.test(path.relative(root, dbpath))){
        return cb(new Error("PATH ERROR: Attempting to access outside root"))
    }

    // Check that the database exists
    if(!fileexists(dbpath)){
        return cb(new Error("Database not found"))
    }

    DBjson = fs.readJSONSync(dbpath);

    this.startUpDB(DBjson, cb);

}

cli.prototype.saveDB = function(dbName, cb, safe){
    var dbpath = path.join(root, dbName + ".json")

    thisDB = this.runningDBs[dbName];
    if (!thisDB) {
        return cb(new Error("Can't save non-existant db " + dbName))
    }

    DBjson = {
            "name": dbName,
            "account": thisDB.account,
            "erisdbURL": (/\:\/\//.test(thisDB.url)) ? thisDB.url : "http://" + thisDB.url,
            "contracts": thisDB.contractModels
        }

    // Check that the path is not outside the root
    if(/..\//.test(path.relative(root, dbpath))){
        return cb(new Error("PATH ERROR: Attempting to access outside root"))
    }

    //Check that the database does not already exist
    if(safe && fileexists(dbpath)){
        return cb(new Error("Database already exists. Try using or loading."))
    }

    try {
        fs.writeJSONSync(dbpath, DBjson)
    } catch (e) {
        return cb(e);
    }

    return cb(null);

}

cli.prototype.startUpDB = function(DBjson, cb){
    //Create the DB

    this.runningDBs[DBjson.name] = {};
    thisDB = this.runningDBs[DBjson.name]
    thisDB.db = new sc(':memory:');
    thisDB.url = (/\:\/\//.test(DBjson.erisdbURL)) ? DBjson.erisdbURL : "http://" + DBjson.erisdbURL
    thisDB.account = DBjson.account;
    thisDB.CM = erisContracts.newContractManagerDev(DBjson.url, DBjson.account);

    thisDB.contractModels = DBjson.contracts;
    thisDB.contracts = {};

    //Loop through contracts
    async.eachOfSeries(DBjson.contracts, function(cData, cName, callback){
        var address = cData.address;
        var model = resolveModel(cData.model);

        var contract = getContract(thisDB.CM, address, model.abi);
        thisDB.contracts[cName] = contract;

        thisDB.db.addContract(contract, model.structDef, cName, callback);
    }, cb)
}

cli.prototype.deleteDB = function(dbName, cb) {
    var dbpath = path.join(root, dbName + ".json")

    // Check that the path is not outside the root
    if(/..\//.test(path.relative(root, dbpath))){
        return cb(new Error("PATH ERROR: Attempting to access outside root"))
    }

    // Check that the database exists
    if(!fileexists(dbpath)){
        return cb(new Error("Database not found"))
    }

    try {
        fs.unlinkSync(dbpath)
    } catch (e) {
        return cb(e);
    }

    this.shutDownDB(dbName, cb);
}

cli.prototype.shutDownDB = function(dbName, cb) {

    //Also delete it from runningdbs if its there
    if (this.runningDBs[dbName]) {
        console.log("TODO BETTER -  shutDownDB")
        delete this.runningDBs[r.args[1]];
    }

    return cb(null);
}

cli.prototype.drop = function(r, token){
    var self = this;
    console.log("DROP")
    // drop database name
    if (/database/i.test(r.args[0])){
        console.log("database")

        if (!r.args[1]) return token(new Error("Database name not provided"));

        return this.deleteDB(r.args[1], token);

    } else if (/contract/i.test(r.args[0])){
        console.log("contract")

        if (!this.currentDB){
            return token(new Error("No database in use"));
        } 

        if (!r.args[1]) return token(new Error("Contract name not provided"));

        this.removeContractFromDB(this.currentDB, r.args[1], function(err){
            if (err) return token(err);
            self.saveDB(self.currentDB, token)
        });

    } else {
        return token(new Error("Unrecognized keyword: " + r.args[0]))
    }
}






cli.prototype.use = function(r, token){
    console.log("USE")
    var self = this;

    if (!this.runningDBs[r.args[0]]){
        console.log("Database not running; Starting now...")
        
        this.loadDB(r.args[0], function(err){
            if (err) return cb(err);
            self.currentDB = r.args[0];
            return token(null);
        })

    } else {
        self.currentDB = r.args[0];
        return token(null);
    }
}



cli.prototype.query = function(r, token){
    console.log("QUERY")
    console.log(r)
    return token(null);
}

cli.prototype.modify = function(r, token){
    console.log("MODIFY")
    return token(null);
}

cli.prototype.show = function(r, token){

    if (/databases/i.test(r.args[0])){
        //List all databases
        console.log("")
        console.log("Known Databases:".underline)
        dirlist = fs.readdirSync(root);

        for (var i = 0; i < dirlist.length; i++) {
            if (!/^\./.test(dirlist[i])){
                var fullpath = path.join(root, dirlist[i]);
                var name = dirlist[i].split('.')[0];
                if (fs.statSync(fullpath).isFile()){
                    (name == this.currentDB) ? console.log(name.green) : console.log(name.red);
                }
            }
        };

        console.log("")
        return token(null);

    } else if (/contracts/i.test(r.args[0])){
        //Display Contract info?

    } else {
        return token(new Error("Unrecognized keyword: " + r.args[0]))
    }

    return token(null);
}

cli.prototype.help = function(r, token){
    console.log("HELP")
    return token(null);
}



var app = new cli();

app.prepare();
app.terminal();