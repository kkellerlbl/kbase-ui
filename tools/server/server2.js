/*global process, console, require*/
var Promise = require('bluebird');
var static = require('node-static');
var path = require('path');
var fs = Promise.promisifyAll(require('fs'));
var execAsync = Promise.promisify(require('child_process').exec);
var open = require('open');
var yaml = require('js-yaml');
var pathExists = require('path-exists');
var http = require('http');
var path = require('path');
var url = require('url');

function loadYaml(path) {
    'use strict';
    var yamlPath = path.join('/');
    return fs.readFileAsync(yamlPath, 'utf8')
        .then(function (contents) {
            return yaml.safeLoad(contents);
        });
}

function loadBuildConfig(state) {
    'use strict';
    return Promise.resolve(pathExists('../../dev/config'))
        .then(function (devExists) {
            var configRoot;
            if (devExists) {
                configRoot = ['..', '..', 'dev', 'config'];
                return [configRoot, loadYaml(configRoot.concat(['builds', state.args.build + '.yml']))];
            } 
            configRoot = ['..', '..', 'config'];
            return [configRoot, loadYaml(configRoot.concat(['builds', state.args.build + '.yml']))];
        })
        .spread(function (configRoot, config) {
            state.config.build = config;
            state.config.root = configRoot;
            return state;
        });
}

function extensionToContentType(extension) {
    if (!extension || extension.length === 0) {
        return 'text/html';
    }
    var map = {
        html: 'text/html',
        js: 'text/javascript',
        json: 'application/json',
        yml: 'text/yaml',
        css: 'text/css',
        png: 'image/png',
        jpg: 'image/jpg',
        gif: 'image/gif',
        wav: 'audio/wav',
        woff: 'text/woff'
    };
    return map[extension];
}

function start(state) {
    var directory = state.args.directory,
        rootDir,
        port = state.config.build.server.port,
        title = 'kbup-' + String(port);

    console.log('Starting local kbase-ui server');
    console.log('Type      : ' + state.args.build);
    console.log('Directory : ' + state.args.directory);
    console.log('Port      : ' + port);

    http.createServer(function (request, response) {
        if (directory === 'deployed') {
            // TODO: get this from the deploy config
            rootDir = '/kb/deployment/services/kbase-ui/';
        } else {
            rootDir = path.normalize([__dirname, '..', '..', 'build', directory, 'client'].join('/'));
        }
        process.title = title;
        if (!fs.existsSync(rootDir)) {
            console.log('root dir ' + rootDir + ' does not exist or is not accessible to you');
            return;
        }
        var file = new static.Server(rootDir, {cache: false});
        console.log('root: ' + rootDir);        

        // Configure.
        //  var mainRoot = ['..', 'runtime', 'build'];
        var requestUrl = url.parse(request.url);
        
        

        // convert to an array
        var l = requestUrl.pathname.split('/');
        var normalized = l.filter(function (pathElement) {
            var el = pathElement.trim();
            switch (el) {
                case '':
                case '.':
                case '..':
                    return false;
            }
            return true;
        });

        var pathList = normalized;
        // simulate the root index.
        if (pathList.length === 0) {
            response.writeHead(302, {'Location': '/index.html'});
            response.end();
            return;
            // pathList = ['htdocs/index.html'];
        }


        var filePath = rootDir.concat(pathList);
        var extension = path.extname(pathList[pathList.length - 1]);
        // extend if need to...
        var contentType = extensionToContentType(extension.substr(1));
        if (!contentType) {
            response.writeHead(400);
            response.end('Extension ' + extension + ' not supported', 'utf-8');
            return;
        }

        var filePathString = filePath.join('/');
        fs.readFile(filePathString)
            .then(content) {
                response.writeHead(200, {'Content-Type': contentType});
                response.end(content, 'utf-8');
            })
            .catch(function (error) {
                console.log('ERROR reading file');
                console.log(error);
                if (error.code === 'ENOENT') {
                    response.writeHead(404);
                    repsonse.end('Sorry, page not found');
                } else {
                    response.writeHead(500);
                    response.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
                }
            });
        });

    }).listen(port);
    console.log('Server running at ' + port);
}

function startx(state) {
    var directory = state.args.directory,
        rootDir,
        port = state.config.build.server.port,
        title = 'kbup-' + String(port);

    console.log('Starting local kbase-ui server');
    console.log('Type      : ' + state.args.build);
    console.log('Directory : ' + state.args.directory);
    console.log('Port      : ' + port);

    if (directory === 'deployed') {
        // TODO: get this from the deploy config
        rootDir = '/kb/deployment/services/kbase-ui/';
    } else {
        rootDir = path.normalize([__dirname, '..', '..', 'build', directory, 'client'].join('/'));
    }
    process.title = title;
    if (!fs.existsSync(rootDir)) {
        console.log('root dir ' + rootDir + ' does not exist or is not accessible to you');
        return;
    }
    var file = new static.Server(rootDir, {cache: false});
    console.log('root: ' + rootDir);

    require('http').createServer(function (request, response) {
        request.addListener('end', function () {
            // 
            // Serve files! 
            // 
            file.serve(request, response)
                .addListener('error', function (err) {
                    console.log('ERROR: ' + request.url + ':' + err.message);
                });

        }).resume();
    }).listen(port);
    console.log('Preview server started as process: ' + title + ', with id: ' + String(process.pid));
}

function getServerPid(port) {
    var title;
    return execAsync('ps -o pid,command')
        .then(function (stdout, stderr) {
            title = 'kbup-' + String(port);
            return stdout.toString()
                .split('\n')
                .map(function (item) {
                    return item.trim(' ').split(/[ ]+/);
                })
                .filter(function (row) {
                    if (row.length < 2) {
                        return false;
                    }
                    if (row[1] === title) {
                        return true;
                    }
                    return false;
                });
        })
        .then(function (procs) {
            if (procs.length === 1) {
                var pid = parseInt(procs[0]);
                return pid;
            } else if (procs.length === 0) {
                throw new Error('No processes matched ' + title);
            } else {
                throw new ('Too many processes matched ' + title);
            }
        });
}

function stop(state) {
    // yeah, well, we'll improve this...
    console.log('Stopping server on port ' + state.config.build.server.port);
    getServerPid(state.config.build.server.port)
        .then(function (pid) {
            console.log('PID: ' + pid);
            process.kill(pid);
        });
}

function preview(state) {
    getServerPid(state.config.build.server.port)
        .then(function () {
            var port = state.config.build.server.port;
            var url = 'http://localhost:' + String(port);
            console.log('Opening browser for ' + url);
            open(url);
        })
        .catch(function (err) {
            console.log('Cannot preview the site -- server not started');
        });
}

function usage() {
    console.log('node server <cmd>');
}

function importArgs() {

}

function main(state) {
    loadBuildConfig(state)
        .then(function (state) {
            switch (state.args.action) {
                case 'start':
                    start(state);
                    break;
                case 'stop':
                    stop(state);
                    break;
                case 'preview':
                    preview(state);
                    break;
                default:
                    usage(state);
            }
        })
        .catch(function (err) {
            console.log('ERROR');
            console.log(err);
            usage();
        });
}

var action = process.argv[2];
if (action === undefined) {
    throw new Error('action required: node server <action> <build> <directory>');
}
var build = process.argv[3];
if (build === undefined) {
    throw new Error('action required: node server <action> <build> <directory>');
}

var directory = process.argv[4] || 'build';

main({
    args: {
        action: action,
        build: build,
        directory: directory
    },
    config: {
    }
});