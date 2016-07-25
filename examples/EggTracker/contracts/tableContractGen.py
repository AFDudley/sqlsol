import json
import sys


def t(tbl):
	ret = ""
	if tbl < 0:
		return ""
	else:
		for i in xrange(tbl):
			ret = ret + "\t"
		return ret


def conStruct(rowDef, tbl):
	s = ""
	s += t(tbl) + "struct row {\n"
	tbl += 1
	for col in rowDef:
		s += t(tbl) + col['type'] + " " + col['name']  + ";\n"
	s += t(tbl) + "bool exists;\n"

	tbl -= 1
	s += t(tbl) + "}\n"

	return s


infilename = sys.argv[1]
outfilename = sys.argv[2]

infile = open(infilename, 'r')
TD = json.load(infile)


tbl = 0

str = ""
str += t(tbl) + "import( \"../stdlib/errors.sol\";\n"
str += t(tbl) + "import( \"../stdlib/linkedList.sol\";\n"
str += "\n"

str += t(tbl) + "contract " +  TD['name'] + " is Errors, linkedlist{\n"
tbl += 1

str += t(tbl) + "event update(string name, uint key1, uint key2);\n"
str += t(tbl) + "event remove(string name, uint key1, uint key2);\n"

str += "\n"

str += conStruct(TD['row'], tbl)

# If two keys then generate a second struct 
# TODO 

str += "\n"
str += t(tbl) + ""

# 


print str



