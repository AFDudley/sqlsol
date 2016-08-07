# sqlsol - A solidity event driven SQLite3 cache for syncing with smart contracts 

[See here for some standard library goodies](examples/EggTracker/contracts/stdlib/)

## Table of Contents
- [About](#about)
- [Example](#example)
- [Install](#install)
- [Usage](#usage)
- [API](#api)
- [Resources](#resources)
- [Contributions](#contributions)
- [License](#license)

## About
Here you will find code to simplify the process of querying a running blockchain. An example is provided to demonstrate building an application on a event based auto-updating sql table tied to smart contracts. This facilitates building smart contract applications on the [Eris Platform](https://github.com/eris-ltd/eris-cli)

## Example
The smart contract application example that is provided allows participants and viewers to verify a history of events attached to a particular object (in this case eggs). 

Due to the public nature of the data attached to the egg, one must carefully consider their goals before using it as a source of any degree of security. The primary source of security is the requirement of two party agreement to a transfer through signed transactions by user's own private key.

## Install
- have [eris-cli](https://docs.erisindustries.com/tutorials/getting-started/) installed

## Usage

```bash
npm install
node examples/EggTracker/server.js
```

Wait for it to finish its start up procedure. 

**Note:** For simplicity, the start up sequence boots a temporary test chain and deploys the contracts. While this makes it easier to start, it means that *every time you run this script, a brand new contract with no data will be created*. Adapt the example for your purposes.

## API

### Making data

The server serves an endpoint for creating eggs

`GET http://localhost:1212/secret/:desc`
(todo: should be a POST)

`:desc` is a description of the egg. 

Enter the url either in curl `curl http://localhost:1212/secret/wordsgohere`
(in a second terminal), or by putting the url in a browser.

You will see some output (from the server terminal) indicating that things are being updated. This is the egg's data and history being generated (printed out to demonstrate the event emitter). Once completed, a message will be returned telling you the `eggid` of the newly created egg.

### Retrieving data

Three endpoints are provided to demonstrate data retrieval from the cache.

`GET http://localhost:1212/eggs/:eggid`

returns a JSON object of the egg data, including history

`GET http://localhost:1212/pp/:eggid`

returns HTML showing egg data (for browsers)

`GET http://localhost:1212/ppcmd/:eggid`

returns formatted strings for when calling by curl.

In all of the above, `:eggid` is the id assigned to the egg upon creation, that you wish to retrieve data for.

## Resources
examples/EggTracker/server.js - main app file
examples/EggTracker/eggStruct.json - the definition file
examples/EggTracker/contracts/eggtracker.sol - the smart contract we are using.


