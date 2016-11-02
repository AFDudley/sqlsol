Sqlsol - The (sort of) Definitive Guide

sqlsol is a node based library which allows you to create an in-memory SQL-queryable cache of data objects from a contract which is kept up to date (+/- a 1-2 second update time) to the state of a contract. It does this through the a description of the data objects and names for the tables along with names of functions for getting the data for a particular object (What I will refer to as a "Get Row function"). It also (for reasons that will be clear in further discussion) provides a section which describes how to initialize these tables. This file will be referenced as the Structure Definition file. Along with the contract's abi this is all that is required as far as configuration of sqlsol is concerned. However in order to be compatible a smart contract which is being cached must provide certain functions and events to inform and provide information to the cache. I'm going to use an example to demonstrate the key considerations. Followed by a description of the format of the Structure Definition file and finally with some considerations that might need to be taken into account with more complex multi contract structures.


Section 1: Description by Example

To start this guide we are going to be using a example contract which tracks users and Pokemon cards they own. Most of the actual operational functions will be left to your imagination however lets say that this is a contract that allows for people to declare what cards they have (users can create rows).

Objects:
When we think of a contract it often is as an object of as a store of objects on which identical logic acts. In this case we are going to assume all objects are stored in a single contract for simplicity. The objects we are working with are Users and Pokemon cards. Users will have a list of pokemon cards they own.

```
struct pokeCard = {
	uint pokedexNumber;
	string pokemonName;
	string description;
	bool shiny;
}
```

```
struct user = {
	string name;
	serialList pokeCardList;
}
```

Here I using a struct "serialList" which is a custom data type which creates an iterable linked list which supports functions for getting an item at a particular position in the list, removing an item from the list efficiently, and of course adding items to the list. The reason I am using this and not just a mapping or an array is will be clear when I discuss initializing tables and deserialization of objects. However usage of a serial list is NOT mandatory, in my experience it just makes things simpler especially when dealing with non-sequential values such as addresses.


The variable defintion of this contract would likly look somthing like this:
```
//Pokemon Cards data
mapping(uint => pokeCard);

//User Data
mapping(address => user);

//Serialization of users
serialList userList;
```

You might wonder why the pokeCards are also not serialized. The reason is because of how i am planning on structuring the tables. I want to have two tables 1 called "users" and one called "cards". The user table I plan to have look something like the following:

```
| address (PK)   | name 		| collectionSize |
|----------------|--------------|----------------|
| ABF45D00E210...|Bob McGumbo 	| 1583 			 |
| C89F0211FA4C...|Jim James 	| 31 			 |
```
and for the cards table I would like to have the following:

```
|address (PK)    | cardID (PK) | pokedexNumber | pokemonName | description    | shiny |
|----------------|-------------|---------------|-------------|----------------|-------|
| ABF45D00E210...| 99283 	   | 151           | mew 	     | New 	          | True  |
| ABF45D00E210...| 299100023   | 1  		   | bulbasaur   | Like-New       | False |
| C89F0211FA4C...| 3049293     | 54            | psyduck 	 | Special Editon | False |
```

In these examples (PK) indicates which columns are primary keys. The best way to think of the primary keys is what unique identifier does the contract use to reference these objects. In the case of users the address of the user is almost always used as it is guaranteed to be unique. In the cards table there are two primary keys (yes this is allowed the actual primary key in sql will be the UNIQUE combination of the two keys parked primary) In this case I have given all cards a unique uint ID which will serve nicely.

Since in this contract all pokecards are owned I don't need to serialize the pokecards themselves since each pokecard on the system will only appear once in the cards table. However you could rework this structure to make the owner a non-primary key field and just reference by the ID number. There is no good reason NOT to do this except that I am trying to demonstrate a particular type of behaviour with sqlsol. Namely that of dependant keys. 

But before we get to that we can fill out part of the contract functions that will need to be provided. The Get-Row functions. Every table needs exactly ONE Get-Row function by which the cache will fill out the rows. The format of ANY Get-Row function is the following:

```
function getRow(k1type key1, k2type key2) constant returns (c1type c1name, c2type c2name, ....){
	c1name = c1value;
	c2name = c2value;
	return
} 
```

The returns must be named as sqlsol uses the ABI to fill out the column names and to determine what type the column's data will be. Keys 1 and 2 are the primary keys that the table has. if a table only has one key you only need to define one obviously.

*At this time no more then 2 keys may be used for a table!!!*

*NOTE: The actual name of the getRow function can be anything... just remember it later*

Lets give examples for the users and cards table:

```
function getUser(address userAddress) constant returns (string name, uint collectionSize){
	user thisUser = users[userAddress];
	name = thisUser.name;
	collectionSize = thisUser.pokeCardList.length;
	return;
}

function getUserCard(address userAddress, uint cardID) constant returns (
					uint pokedexNumber,
					string pokemonName,
					string description,
					bool shiny){
	pokeCard thisPC = pokeCards[cardID];
	pokedexNumber = thisPC.pokedexNumber;
	pokemonName = thisPC.pokemonName;
	description = thisPC.description;
	shiny = thisPC.shiny;
	return;
}
```

Now that we have our Get-Row functions defined we can fill out the tables section of the structure definition file.

```
{
	"initSeq":{},
	"tables":{
		"users":{
			"call": "getUser",
			"keys": ["address"]
		},
		"cards":{
			"call": "getUserCard",
			"keys": ["address", "cardID"]
		}
	} 
}
```

A explanation of the parts here is in order. Each table is defined by the named object under the tables object. REMEMBER WHAT YOU NAME YOUR TABLES THEY ARE WHAT THE CONTRACT WILL USE TO INDICATE UPDATES. The only mandatory field for a table definition is the "call" which is the name of the Get-Row function for that table. Notice that the names of columns are not provided, this is because those are read from the ABI so only the function name needs to be defined. The "keys" section is technically optional (It can read from the ABI those names too) but for the initialization sequence it is generatlly clearer to simply put them in. Note that when you fill in those fields the name of the column will be what you have placed. for example my column in the users table will be called "address" and not "userAddress" because I defined the name.


Initialization: The PITA

The hardest part about this whole system is simply that erisdb does not provide access to the history of all events. This causes difficulties because if a cache goes offline for a bit the only way it can be certain it is up to date is to ask for ALL current information. A process I call initialization. This is a potentially expensive operation but must be done in order to ensure that the cache is properly up to date. In the future this will likely not be necessary if we add in the ability to obtain all events of a particular type since some block X in the past.

Until then we must deal with the question of how to even find all the data in the contract. Especially when some of that data might not be sequentially arranged (for example user addresses). The SqlSol cache assumes that all object have some sort of order to them in order to be able to loop through them at start up. For each key required a description of how to loop through the values for that key must be provided and this is what the initSeq provides.

This is the hardest part for me to describe inuitively but the reason I have those "serialList"s in the contract is  precisely for this part of the sync up process. Since the things are serialized we can loop through them by index. To see what I mean take a look at the initSeq for the address key. The problem we have is we want all user addresses. unfortunately all user addresses are not sequential so if we start looking for tham starting at 0 it will take a long time to find them all.

The initSeq section for addresses looks like this:

```
"address":{
			"min":0, 
			"deserialize":"deserializeUsers",
			"len":{"call": "getLengths", "field": "USERLen"}
		}
```

What this tells SQLSol in order is to start counting keys at 0 and that in order to find how many keys there are that it should call the function "getLengths" from the contract and in the return data of that call it should use the field "USERLen". Finally if the keys were nice and serial already then you would be done. However the addresses are not nice sequential values so we are going to provide a "deserialization" function in the contract that will translate the integer position of the key to an actual address and return the actual key.

For an example let me show the solidity contracts we need to satisfy this.

```
function getLengths() constant returns (uint USERLen) {
	USERLen = userList.length; //Get the length of the serialized list of user addresses
} 

function deserializeUsers(uint pos) constant returns (address) {
	return address(serialize.getAtPos(userList, pos)) //Get the key from the serialize lib function and return it
}
```

This is relatively simply for the address case however recall that the pokecards each person uses is stored on a per user basis.

```
struct user = {
	string name;
	serialList pokeCardList;
}
```

This means that the initialization sequence for the cards table has to loop through the users first and then loop through the cards each user owns. This is what we call a dependant key. Its initSeq entry looks as follows:

```
"cardID": {
			"min":0,
			"dependent": "address",
			"deserialize":"deserializeCards",
			"len":{"call": "getUser", "field": "collectionSize"}
		}
```

There is a couple interesting things about this. First off the dependent field indicates that the length of the secondary keys to be loop through is dependent on which value of the address key you are using. Second once again in order to get the actual cardID (instead of its list position) we will need to provide a deserialization function. Finally note that the length call is actually already written as the getUser function provides the card list length as one of the return fields in "collectionSize". So we only need to write the deserialization function.

```
function deserializeCards(address userAddress, uint pos) constant returns (uint) {
	user thisUser = users[userAddress];
	return uint(serialize.getAtPos(thisUser.pokeCardList, pos));
}
```

Only one thing to note with this is that if a dependant key is deserialized, it is provided the already deserialized value for the first key, NOT two positions.


Update Events: The Easy Part

Finally after the tables have been defined and updated we need the cache to update throughout its life span. Thankfully this part is easy. Whenever an object is updated you simply need to emit an event with the name of the table you wish to update along with the required keys. SQLSOL will listen to any event with a naming scheme of "update\*".

*NOTE do not name any events with the same update\* naming scheme or sqlsol with crash.* 

For example we have two tables and we will define an update event for each of them.

```
event updateUsers(string name, address key1);
event updateCards(string name, address key1, uint key2);
```
Note that the format of the event data should match the names but the types of key1 and key2 can be whatever you need them to be.

Just to show it in use imagine that the contract allows users to declare cards that they own using the "declare" function below. Once declared an update should be triggered so the cache can be updated.

```
function declare(uint pokedexNum, string pokeName, string desc, bool shiny){
	user thisUser = users[msg.sender];
	pokeCard thisPC = cards[cardCount];
	thisPC.pokedexNumber = pokedexNum;
	thisPC.pokemonName = pokeName;
	thisPC.description = desc;
	thisPC.shiny = shiny;

	serialize.append(thisUser.pokeCardList, cardCount);

	updateUsers("users", msg.sender);
	updateCards("cards", msg.sender, cardCount);
	cardCount += 1;
}
```

If you which to delete an entry from the associated table you can trigger a remove\* event similarly to the update event but it will remove the entry with the provided keys from the provided table name.

We now have covered all the components that go into being sqlsol compatible. Namely they can be summed up as, Get-Row functions, Initialization sequence functions (length getting and deserialization functions) and update events. For completeness I am putting the two files together here for reference (and filling in a couple glue pieces)

pokeTracker.sol:
```
require serialize.sol;

contract pokeTracker {

	// Event Definitions
	event updateUsers(string name, address key1);
	event updateCards(string name, address key1, uint key2);

	//Struct Definitions

	struct pokeCard = {
		uint cardID;
		uint pokedexNumber;
		string pokemonName;
		string description;
		bool shiny;
	}

	struct user = {
		string name;
		serialList pokeCardList;
	}

	//Data
	//Pokemon Cards data
	mapping(uint => pokeCard);

	//User Data
	mapping(address => user);

	//Serialization of users
	serialList userList;

	uint cardCount;



	//Initialization functions
	function getLengths() constant returns (uint USERLen) {
		USERLen = userList.length; //Get the length of the serialized list of user addresses
	} 

	function deserializeUsers(uint pos) constant returns (address) {
		return address(serialize.getAtPos(userList, pos)) //Get the key from the serialize lib function and return it
	}

	function deserializeCards(address userAddress, uint pos) constant returns (uint) {
		user thisUser = users[userAddress];
		return uint(serialize.getAtPos(thisUser.pokeCardList, pos));
	}

	// Get-Row Functions
	function getUser(address userAddress) constant returns (string name, uint collectionSize){
		user thisUser = users[userAddress];
		name = thisUser.name;
		collectionSize = thisUser.pokeCardList.length;
		return;
	}

	function getUserCard(address userAddress, uint cardID) constant returns (
						uint pokedexNumber,
						string pokemonName,
						string description,
						bool shiny){
		pokeCard thisPC = pokeCards[cardID];
		pokedexNumber = thisPC.pokedexNumber;
		pokemonName = thisPC.pokemonName;
		description = thisPC.description;
		shiny = thisPC.shiny;
		return;
	}


	//Normal operation functions

	function declare(uint pokedexNum, string pokeName, string desc, bool shiny){
		user thisUser = users[msg.sender];
		pokeCard thisPC = cards[cardCount];
		thisPC.pokedexNumber = pokedexNum;
		thisPC.pokemonName = pokeName;
		thisPC.description = desc;
		thisPC.shiny = shiny;

		serialize.append(thisUser.pokeCardList, cardCount);

		updateUsers("users", msg.sender);
		updateCards("cards", msg.sender, cardCount);
		cardCount += 1;
	}
}
```

and pokeTrackerStruct.json
```
{
	"initSeq":{
		"address":{
			"min":0, 
			"deserialize":"deserializeUsers",
			"len":{"call": "getLengths", "field": "USERLen"}
		},
		"cardID": {
			"min":0,
			"dependent": "address",
			"deserialize":"deserializeCards",
			"len":{"call": "getUser", "field": "collectionSize"}
		}
	},
	"tables":{
		"users":{
			"call": "getUser",
			"keys": ["address"]
		},
		"cards":{
			"call": "getUserCard",
			"keys": ["address", "cardID"]
		}
	} 
}


And thats what its all about

Description of section of the structure Definition file:

TODO

IMPORTANT NOTES:

All events, initialization and get-row functions must come from A SINGLE CONTRACT with a known address. SQLSol will listen to and call only a single contract per structure defintion file. the logistics of making it listen to multiple contracts (even from a factory) is too complex at this time due to the JS lib implementations. It could be done at some future time with some effort but I personally hope to have a cleaner solution built by then that avoids initialization all together.

WHAT THIS MEANS FOR YOU IS

If you have a factory contract that produces objects (rather then storing them all) you should have the factory contract have the events and SQLSOL compatibility functions which it can then forward to the children contracts. I am personally still of the opinion that in most cases we should have a "table" contract which logic contracts access. But failing that make sure that the factory forwards the get-Row and intialization functions appropriately and exposes a function which its children can call to emit the update events


Thats all I can think of for now. this section will grow as more questions get raised






