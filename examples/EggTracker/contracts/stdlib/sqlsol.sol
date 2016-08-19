contract sqlsol{
	// Supported key types
	// S -> string
	// U -> uint
	// I -> int
	// B -> bytes32 
	// A -> address


	// Update events
	event update(string name, uint key1, uint key2);

	event updateSS(string name, string key1, string key2);
	event updateSU(string name, string key1, uint key2);
	event updateSI(string name, string key1, int key2);
	event updateSB(string name, string key1, bytes32 key2);
	event updateSA(string name, string key1, address key2);

	event updateUS(string name, uint key1, string key2);
	event updateUU(string name, uint key1, uint key2);
	event updateUI(string name, uint key1, int key2);
	event updateUB(string name, uint key1, bytes32 key2);
	event updateUA(string name, uint key1, address key2);

	event updateIS(string name, int key1, string key2);
	event updateIU(string name, int key1, uint key2);
	event updateII(string name, int key1, int key2);
	event updateIB(string name, int key1, bytes32 key2);
	event updateIA(string name, int key1, address key2);

	event updateBS(string name, bytes32 key1, string key2);
	event updateBU(string name, bytes32 key1, uint key2);
	event updateBI(string name, bytes32 key1, int key2);
	event updateBB(string name, bytes32 key1, bytes32 key2);
	event updateBA(string name, bytes32 key1, address key2);

	event updateAS(string name, address key1, string key2);
	event updateAU(string name, address key1, uint key2);
	event updateAI(string name, address key1, int key2);
	event updateAB(string name, address key1, bytes32 key2);
	event updateAA(string name, address key1, address key2);


	// Remove events
	event remove(string name, uint key1, uint key2);

	event removeSS(string name, string key1, string key2);
	event removeSU(string name, string key1, uint key2);
	event removeSI(string name, string key1, int key2);
	event removeSB(string name, string key1, bytes32 key2);
	event removeSA(string name, string key1, address key2);

	event removeUS(string name, uint key1, string key2);
	event removeUU(string name, uint key1, uint key2);
	event removeUI(string name, uint key1, int key2);
	event removeUB(string name, uint key1, bytes32 key2);
	event removeUA(string name, uint key1, address key2);

	event removeIS(string name, int key1, string key2);
	event removeIU(string name, int key1, uint key2);
	event removeII(string name, int key1, int key2);
	event removeIB(string name, int key1, bytes32 key2);
	event removeIA(string name, int key1, address key2);

	event removeBS(string name, bytes32 key1, string key2);
	event removeBU(string name, bytes32 key1, uint key2);
	event removeBI(string name, bytes32 key1, int key2);
	event removeBB(string name, bytes32 key1, bytes32 key2);
	event removeBA(string name, bytes32 key1, address key2);

	event removeAS(string name, address key1, string key2);
	event removeAU(string name, address key1, uint key2);
	event removeAI(string name, address key1, int key2);
	event removeAB(string name, address key1, bytes32 key2);
	event removeAA(string name, address key1, address key2);
}