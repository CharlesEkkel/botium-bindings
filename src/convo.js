'use strict'

const log = require('./util/log');
const slugify = require('./util/slugify');
const firstline = require('./util/firstline');

const fs = require('fs')
const path = require('path')
const readdirSync = require('fs').readdirSync;
const mkdirp = require('mkdirp');
const async = require('async');
const EOL = "\n";
const isJSON = require('is-json');
const _ = require('lodash');

var convodir = './spec/convo/';
var suffix = '.convo.txt';

function setConvoDir(c) {
  convodir = c;
}

function readConvos() {
  return new Promise(function(readConvosResolve, readConvosReject) {
    fs.access(convodir, (err) => {
      if (err) return readConvosResolve([]);
      
      fs.readdir(convodir, (err, filenames) => {
        if (err) return readConvosReject(err);
        
        var convos = [];
        
        async.each(filenames, 
          (filename, callback) => {
            if (!filename.endsWith(suffix)) {
              callback();
              return;
            }
            firstline.firstline(path.resolve(convodir, filename)).then(
              (header) => {
                convos.push(createConvoEntry(filename, header));
                callback();
              }).catch(
              (err) => {
                log.warn('error reading first line of file ' + filename + ': ' + err);
                callback();
              });
          },
          (err) => {
            if (err) {
              readConvosReject(err)
            } else {
              readConvosResolve(convos);
            }
          });
      });
    });
  });
}

function readConvosSync() {
  var filenames = readdirSync(convodir).filter((filename) => filename.endsWith(suffix));
  var convos = [];
  filenames.forEach(function (filename) {
    var header = firstline.firstlineSync(path.resolve(convodir, filename));
    convos.push(createConvoEntry(filename, header));
  });
  return convos;
}

function createConvoEntry(filename, header) {
	if (!header || header.startsWith('#'))
    header = filename;
  
  return {
    name: header.trim(),
    filename: filename
  };
}

function readConvo(filename) {
  
	var convofilename = path.resolve(convodir, filename);
  
  var parseMsg = function(lines) {
    if (!lines) return null;
    
    var content = lines.join(' ');
    if (isJSON(content)) {
      return JSON.parse(content);
    } else {
      return lines.join(EOL);
    }
  };
  
  return new Promise(function(readConvoResolve, readConvoReject) {
  
    fs.readFile(convofilename, (err, content) => {
      if (err) return readConvoReject(err);
      
      var lines = content.toString().split(EOL);

      var convo = {
        filename: filename,
        conversation: []
      };
      
      var currentLines = [];
      var currentFrom = null;
      var currentChannel = null;
      lines.forEach((line) => {
        line = line.trim();
        if (!line) {
          return;
        } else if (line.startsWith('#')) {
          if (currentFrom && currentLines) {
            convo.conversation.push({
              from: currentFrom,
              channel: currentChannel,
              msg: parseMsg(currentLines)
            });
          } else if (!currentFrom && currentLines) {
            convo.name = currentLines[0];
            if (currentLines.length > 1) {
              convo.description = currentLines.slice(1).join(EOL);
            }
          }
          currentFrom = line.substr(1);
          currentChannel = null;
          if (currentFrom.indexOf(' ') > 0) {
            currentChannel = currentFrom.substr(currentFrom.indexOf(' ') + 1).trim();
            currentFrom = currentFrom.substr(0, currentFrom.indexOf(' ')).trim();
          }
          currentLines = [];
        } else {
          currentLines.push(line);
        }
      });
      if (currentFrom && currentLines) {
        convo.conversation.push({
          from: currentFrom,
          channel: currentChannel,
          msg: parseMsg(currentLines)
        });
      } else if (!currentFrom && currentLines) {
        convo.name = currentLines[0];
        if (currentLines.length > 1) {
          convo.description = currentLines.slice(1).join(EOL);
        }
      }
      
			if (convo.conversation.length === 0) {
				readConvoReject('empty conversation file ' + convofilename);
			} else {
				readConvoResolve(convo);
      }
    });
  });
}

function writeConvo(convo, errorIfExists) {

  if (!convo.filename) {
    convo.filename = slugify(convo.name);
  }
  if (!convo.filename.endsWith(suffix))
    convo.filename += suffix;

	var filename = path.resolve(convodir, convo.filename);
	
  return new Promise(function(writeConvoResolve, writeConvoReject) {

    async.series([
      
      function(existsCheckDone) {
        if (errorIfExists)
          fs.access(filename, (err) => {
            if (err) return existsCheckDone();
            existsCheckDone(filename + ' already exists');
          });
        else {
          existsCheckDone();
        }
      },
      
      function(createDirectoryDone) {
				mkdirp(convodir, (err) => {
          if (err) return createDirectoryDone(err);
          createDirectoryDone();
        });
      },
	
			function(writeConvoDone) {

				var contents = '';
        
        contents += convo.name + EOL;
        if (convo.description)
          contents += convo.description + EOL;
        contents += EOL;
        
				convo.conversation.forEach(function (set) {
					contents += '#' + set.from;
          if (set.channel) {
            contents += ' ' + set.channel;
          }
          contents += EOL;
          
          if (_.isString(set.msg)) {
            contents += set.msg + EOL + EOL;
          } else {
            contents += JSON.stringify(set.msg, null, 2) + EOL + EOL;
          }
				});

				fs.writeFile(filename, contents, (err) => {
          if (err) return writeConvoDone(err);
          writeConvoDone();
        });
			},

    ],
    function(err) {
      if (err)
        writeConvoReject(err);
      else
        writeConvoResolve(filename);
    });			
	});			
}


module.exports = {
  setConvoDir: setConvoDir,
	writeConvo: writeConvo,
  readConvos: readConvos,
  readConvo: readConvo,
  readConvosSync: readConvosSync
};
