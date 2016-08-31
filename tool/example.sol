contract example{

	event update(string name, uint key1, uint key2);
	
	mapping(uint => uint) valueHistory;
	uint historyID;

	function setValue(uint val) {
		valueHistory[historyID] = val;
		update('valueHistory', historyID, 0);
		historyID += 1;
		return;
	}

	function getLength() returns (uint histLen){
		histLen = historyID;
		return;
	}

	function getValueAt(uint id) returns (uint value){
		value = valueHistory[id];
		return;
	}
}