#! /usr/bin/env node

var path = require('path');
var fs = require('fs-extra');
var argsparser = require('shell-quote').parse;
var lineparser = require('lineparser');
var mini = require('minimist');


var home = process.env.HOME;
var root = path.join(home, '.eris', 'sqlsol');

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
            ['add', null, null, 'Add stuff', this.add],
            ['modify', null, null, 'Modify things', this.modify],
            ['query', null, null, 'Submit sql query', this.query],
            ['show', null, null, 'Show stuff', this.show],
            ['help', null, null, 'help', this.help],
            [null, null, null, 'help', this.query]
        ]
    };

    this.optparser = lineparser.init(meta);
    this.prompt = require('prompt-sync')({
        sigint: true,
        history: require('prompt-sync-history')('prompt_history.txt', 100)
    });
}

/**
 * The terminal command parsing function
 * @param {EggTerminal) ctx - The EggTerminal instance as context.
 */
cli.prototype.terminal = function() {
    var self = this;
    var cmdline = this.prompt('>> ', 'help');
        self.prompt.history.save();

    this.optparser.parse(argsparser(cmdline), function (err) {
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
    if (e.code != 'ENOENT') 
      throw e;
    
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

cli.prototype.create = function(r, token){
    console.log("CREATE")
    // console.log(r)
    // console.log("==========================")
    // console.log(dobetter(r)) 
    r = dobetter(r);

    if (/database/i.test(r.args[0])){
    // create database name --account/ --address --privkey --edb
        console.log('database')
        var dbpath = path.join(root, r.args[1] + ".json")

        // Check that the path is not outside the root
        if(/..\//.test(path.relative(root, dbpath))){
            return token(new Error("PATH ERROR: Attempting to access outside root"))
        }

        //Check that the database does not already exist
        if(fileexists(dbpath)){
            return token(new Error("Database already exists. Try using or loading."))
        }

        if(!r.parameters['edb']){
            return token(new Error("--edb <URL> is not optional"))
        }

        if(!r.parameters['account'] && !(r.parameters['address'] && r.parameters['privKey'])){
            return token(new Error("One of --account <account.json> or --address <address> and --privKey <privKey> must be provided"))
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

        //Implement the database file creation
        db = {
            "name": r.args[1],
            "account": account,
            "erisdbURL": r.parameters['edb'],
            "contracts": {}
        }

        try {
            fs.writeJSONSync(dbpath, db)
        } catch (e) {
            return token(e);
        }

        return token(null);
    } else if (/contract/i.test(r.args[0])){
    // create contract name  --model/ --abi --struct
        console.log('contract')
        return token(null);
    } else if (/model/i.test(r.args[0])){
    // create model name --abi --struct
        console.log('model')
        return token(null);
    } else {
        return token(new Error("Unrecognized keyword: " + r.args[0]))
    }
}

cli.prototype.drop = function(r, token){
    console.log("DROP")
    // drop database name
    if (/database/i.test(r.args[0])){
        console.log("database")
        var dbpath = path.join(root, r.args[1] + ".json")

        // Check that the path is not outside the root
        if(/..\//.test(path.relative(root, dbpath))){
            return token(new Error("PATH ERROR: Attempting to access outside root"))
        }

        // Check that the database exists
        if(!fileexists(dbpath)){
            return token(new Error("Database not found"))
        }

        try {
            fs.unlinkSync(dbpath)
        } catch (e) {
            return token(e);
        }

        return token(null);

    } else if (/contract/i.test(r.args[0])){
        console.log("contract")
        return token(null)
    } else {
        return token(new Error("Unrecognized keyword: " + r.args[0]))
    }
}

cli.prototype.add = function(r, token){
    console.log("ADD")
    return token(null);
}

cli.prototype.use = function(r, token){
    console.log("USE")
    //use database name
    if (/database/i.test(args[0])){
        //Display database info
        var dbpath = path.join(root, r.args[1] + ".json")

        // Check that the path is not outside the root
        if(/..\//.test(path.relative(root, dbpath))){
            return token(new Error("PATH ERROR: Attempting to access outside root"))
        }

        // Check that the database exists
        if(!fileexists(dbpath)){
            return token(new Error("Database not found"))
        }

        
    } else {
        return token(new Error("Unrecognized keyword: " + r.args[0]))
    }
    return token(null);
}

cli.prototype.query = function(r, token){
    console.log("QUERY")
    return token(null);
}

cli.prototype.modify = function(r, token){
    console.log("MODIFY")
    return token(null);
}

cli.prototype.show = function(r, token){

    if (/databases/i.test(r.args[0])){
        //List all databases
        console.log("\nKnown Databases:")
        console.log("================")
        dirlist = fs.readdirSync(root);
        for (var i = 0; i < dirlist.length; i++) {
            var fullpath = path.join(root, dirlist[i]);
            var name = dirlist[i].split('.')[0];
            if (fs.statSync(fullpath).isFile()){
                (name == this.currentDB) ? console.log("**\t" + name) : console.log(name);
            }
        };
        console.log("")
        return token(null);

    } else if (/database/i.test(args[0])){
        //Display database info

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