/*
Used to parse the output of the 'inspect' command of the Eris tool,
e.g., 'eris chains inspect blockchain NetworkSettings.Ports' yields:

map[1337/tcp:[{0.0.0.0 33121}] 46656/tcp:[{0.0.0.0 33120}] 46657/tcp:[{0.0.0.0 \
33119}]]

The parser translates it to:

{"1337": 33121, "46656": 33120, "46657": 33119}
*/

Ports
  = "map[" head:Mapping tail:(" " mapping:Mapping { return mapping; })* "]\n"
  {
    var
      map;

     map = {};

    [head].concat(tail).forEach(function (mapping) {
      map[mapping.container] = mapping.host;
    });

    return map;
  }

Mapping
  = container:Port ":" host:Host { return {container: container, host: host}; }

Port
  = port:Integer "/tcp" { return port; }

Host
  = "[{" Address " " port:Integer "}]" { return port; }

Address
  = Integer "." Integer "." Integer "." Integer

Integer
  = [0-9]+ { return parseInt(text(), 10); }
