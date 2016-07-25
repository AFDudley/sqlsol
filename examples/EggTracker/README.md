EggTracker Example App README

What this app/smart contract does:

This app/smart contract is designed to allow participants and veiwers to verify a history of events attached to a particular object (in this case eggs). The attempt is made by requiring knowledge of a secret to complete a transfer to tie re-world presence of an object (egg) to the event.

It should be noted that due to the public nature of the data attached to the egg this can not be a fool proof system and one must carefully consider their goals before using it as a source of any degree of security. the primary source of security is the requirement of two party agreement to a transfer through signed transactions by user's own private key.


The App's goal is to demostrate building an application on a event based auto-updating sql table tied to a smart contract and how this makes the writing of the smart contracts and the building of the associated apps simpler.

Input is welcome


Starting the app:

1) Ensure you have eris-cli installed
2) npm install in the root directory
3) Run the javascript file sqlsol/Examples/EggTracker/server.js (server.js in this folder)
4) wait for it to finish its start up procedure

For simplicity the start up sequence includes starting of a temporary test chain and deployment of the contract. While this makes it easier to start it means EVERY TIME YOU RUN THIS SCRIPT YOU WILL GET A BRAND NEW CONTRACT WITH NO DATA IN IT so don't be surprised by that


Making data:

The server serves an endpoint for creating eggs

GET http://localhost:1212/secret/:desc
(This should be post but i'm lazy)

here :desc is a description of the egg. this is a url so no spaces!

Enter the url either in curl `curl http://localhost:1212/secret/wordsgohere`
(in a second terminal)

of by putting the url in a browser

You will see some output (from in the server terminal) indicating things are being updated this is the egg's data and history being generated (it is printed out to demonstrate the event emitter)

once completed a message will be returned telling you the eggid of the newly created egg



Retrieving the data:
In order to demo the data retrieval through the cache three endpoints are provided

GET /eggs/:eggid

Returns a JSON object of the egg data including history

GET /pp/:eggid

Returns some crappy HTML showing egg data (for browsers)

GET /ppcmd/:eggid

Returns formatted strings for when calling by curl


In all of the above :eggid is the number of the egg you wish to retrieve data for.


Important files:

server.js - main app
eggStruct.json - the definition file
/contracts/eggtracker.sol - the smart contract we are using.


