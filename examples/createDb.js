/*eslint-disable no-multi-str */

'use strict'

var child_process = require('child_process')
var fs = require('fs')
var PEG = require('pegjs')
var Promise = require('bluebird')
var R = require('ramda')
var untildify = require('untildify')
var url = require('url')

var dockerMachineIp
var parser

Promise.promisifyAll(child_process)

parser = PEG.buildParser(fs.readFileSync(__dirname + '/parser.pegjs',
  'utf8'))

// Memoize the Docker Machine IP lookup because of
// https://github.com/docker/machine/issues/2612.
dockerMachineIp = R.memoize(child_process.execAsync)

// Return the URL for an Eris service on a running container.
function serviceUrl (type, name, port) {
  return Promise.join(
    dockerMachineIp('docker-machine ip', {encoding: 'utf8'})
      .catchReturn('localhost'),

    child_process.execAsync('eris ' + type + ' inspect ' + name +
      ' NetworkSettings.Ports', {encoding: 'utf8'}).then(function (stdout) {
        return parser.parse(stdout)[port]
      }),
      function (hostname, port) {
        return {
          protocol: 'http:',
          slashes: true,
          hostname: hostname.trim(),
          port: port
        }
      })
}

// Create a fresh chain for each integration test.  Return its URL and
// validator.
module.exports = function (protocol) {
  child_process.execSync('eris chains rm --data --force blockchain; \
    [ -d ~/.eris/chains/blockchain ] || (eris chains make blockchain --chain-type=simplechain); \
    eris chains new --dir=blockchain --publish blockchain; \
    sleep 3', {
      encoding: 'utf8',
      env: R.merge(process.env, {ERIS_PULL_APPROVE: true})
    })

  return serviceUrl('chains', 'blockchain', 1337)
    .then(function (locator) {
      if (protocol === 'WebSocket') {
        locator.protocol = 'ws:'
      }

      return [url.format(locator) +
      (protocol === 'WebSocket' ? '/socketrpc' : '/rpc'),
        require(untildify('~/.eris/chains/blockchain/priv_validator.json'))]
    })
}
