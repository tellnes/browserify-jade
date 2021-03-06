var fs = require('fs');

var jade           = require('jade');
var through        = require('through');
var transformTools = require('browserify-transform-tools');

var SourceMapGenerator = require('source-map').SourceMapGenerator;
var convert   = require('convert-source-map');

var PREFIX = "var jade = require('jade/lib/runtime.js');\nmodule.exports=";

var defaultJadeOptions = {
  path: __dirname,
  compileDebug: true,
  pretty: true,
};

function getTransformFn(options) {
  var key;
  var opts = {};
  for(key in defaultJadeOptions) {
    opts[key] = defaultJadeOptions[key];
  }

  options = options || {};
  for(key in options) {
    opts[key] = options[key];
  }

  return function (file) {
    if (!/\.jade$/.test(file)) return through();

    var data = '';
    return through(write, end);

    function write (buf) {
      data += buf;
    }
    function end () {
      var _this = this;
      configData = transformTools.loadTransformConfig('browserify-jade', file, function(err, configData) {
        if(configData) {
          var config = configData.config || {};
          for(key in config) {
            opts[key] = config[key];
          }
        }

        var result = compile(file, data, opts);
        _this.queue(result);
        _this.queue(null);
      });
    }
  };
}

module.exports = getTransformFn();
module.exports.jade = getTransformFn;
module.exports.root = null;
module.exports.register = register;

function register() {
  require.extensions['.jade'] = function(module, filename) {
    var js = compile(filename, fs.readFileSync(filename, 'utf-8'), {compileDebug: true});
    return module._compile(js, filename);
  }
}

function replaceMatchWith(match, newContent)
{
  var src = match.input;
  return src.slice(0, match.index) + newContent + src.slice(match.index + match[0].length);
}

function withSourceMap(src, compiled, name) {

  //return compiled;

  var compiledLines = compiled.split('\n');
  var generator = new SourceMapGenerator({file: name + '.js'});

  compiledLines.forEach(function(l, lineno) {
    var m = l.match(/^jade(_|\.)debug\.unshift\(\{ lineno: ([0-9]+)/);
    if (m) {
      var originalLine = Number(m[2]);
      var generatedLine = lineno + 2;

      if (originalLine > 0) {
        generator.addMapping({
          generated: {
            line: generatedLine,
            column: 0
          },
          source: name,
          original: {
            line: originalLine,
            column: 0
          }
        });
      }
    }

    var debugRe = /jade(_|\.)debug\.(shift|unshift)\([^)]*\);?/;
    var match;
    while(match = l.match(debugRe)) {
      l = replaceMatchWith(match, '');
    }
    compiledLines[lineno] =l;
  });
  generator.setSourceContent(name, src);

  var map = convert.fromJSON(generator.toString());
  compiledLines.push(map.toComment());
  return compiledLines.join('\n');
}

function compile(file, template, options) {
    options.filename= file;
    var fn;
    if(jade.compileClient) {
      fn = jade.compileClient(template, options);
    } else {
      // jade < 1.0
      options.client = true;
      fn = jade.compile(template, options);
    }

    var generated = fn.toString();
    return PREFIX + withSourceMap(template, generated, file);
}
