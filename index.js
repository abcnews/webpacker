const Path = require('path');
const FS = require('fs-extra');
const Webpack = require('webpack');
const Log = require('./log');

const APP_ROOT_PATH = require('app-root-path').toString();

const DEV_SERVER_PORT = 8000;

function clearRequireCache(target) {
    Object.keys(require.cache).forEach(key => {
        if (key.includes(target)) {
            delete require.cache[key];
        }
    });

    Object.keys(module.constructor._pathCache).forEach(key => {
        delete module.constructor._pathCache[key];
    });
}

// Load the webpack config and apply hot reload options if needed
function webpackConfig(args, config, logged) {
    config = config || {};
    args = args || [];

    clearRequireCache(`${config.app_root_path}/webpack.config`);
    let webpack_config = require(`${config.app_root_path}/webpack.config`);
    if (typeof webpack_config === 'function') {
        webpack_config = webpack_config(config);
    }

    if (args.includes('hot')) {
        if (logged) {
            Log.info('Building with', Log.bold.magenta('Hot Reload'));
        }

        let entry = webpack_config.entry;
        if (typeof webpack_config.entry === 'string') {
            webpack_config.entry = [
                `webpack-dev-server/client?http://localhost:${DEV_SERVER_PORT}`,
                'webpack/hot/dev-server',
                webpack_config.entry
            ];
        } else if (webpack_config.entry instanceof Array) {
            webpack_config.entry.unshift(
                `webpack-dev-server/client?http://localhost:${DEV_SERVER_PORT}`,
                'webpack/hot/dev-server'
            );
        } else {
            Object.keys(webpack_config.entry).forEach(entry => {
                if (typeof webpack_config.entry[entry] === 'string') {
                    webpack_config.entry[entry] = [
                        `webpack-dev-server/client?http://localhost:${DEV_SERVER_PORT}`,
                        'webpack/hot/dev-server',
                        webpack_config.entry[entry]
                    ];
                } else {
                    webpack_config.entry[entry].unshift(
                        `webpack-dev-server/client?http://localhost:${DEV_SERVER_PORT}`,
                        'webpack/hot/dev-server'
                    );
                }
            });
        }

        webpack_config.output.publicPath = `http://localhost:${DEV_SERVER_PORT}/`;
        webpack_config.plugins.push(new Webpack.HotModuleReplacementPlugin());
    } else if (logged) {
        Log.info('Building');
    }

    return webpack_config;
}

const Tasks = {};

Tasks.clean = function(args, config) {
    args = args || [];
    config = config || {};

    let webpack_config = webpackConfig(args, config);

    return new Promise((resolve, reject) => {
        FS.emptyDir(webpack_config.output.path, err => {
            if (err) return reject(err);

            Log.info('Build directory is now empty');
            return resolve();
        });
    });
};

Tasks.build = function(args, config) {
    args = args || [];
    config = config || {};

    return new Promise((resolve, reject) => {
        let webpack_config = webpackConfig(args, config, true);

        let compiler = Webpack(webpack_config);
        if (process.env.NODE_ENV !== 'production') {
            compiler.apply(
                new Webpack.ProgressPlugin((percent, message) => {
                    Log.clearLine();
                    if (percent < 1) {
                        Log.temporaryInfo(
                            `${Math.floor(percent * 100)}%`,
                            Log.gray(`(${message})`)
                        );
                    }
                })
            );
        }

        compiler.run((err, stats) => {
            if (err) return reject(err);

            stats = stats.toJson();

            if (stats.errors.length > 0) {
                stats.errors.forEach(error => {
                    Log.error(error);
                });
                return reject(stats.errors);
            }
            if (stats.warnings.length > 0) {
                stats.warnings.forEach(warning => {
                    Log.warning(warning);
                });
            }

            if (stats.errors.length == 0 && stats.warnings.length == 0) {
                Log.info(
                    'Build finished in',
                    Log.bold(`${Math.round(stats.time / 1000)} seconds`)
                );
            }

            return resolve(stats);
        });
    });
};

Tasks.run = function(args, config) {
    const WebpackDevServer = require('webpack-dev-server');
    const enableDestroy = require('server-destroy');

    args = args || [];
    config = config || {};

    let webpack_config = webpackConfig(args, config);

    const build_started_at = new Date();

    return new Promise((resolve, reject) => {
        process.on('uncaughtException', err => {
            Log.error(err.stack);
        });

        let compiler = Webpack(webpack_config);

        if (process.env.NODE_ENV !== 'production') {
            compiler.apply(
                new Webpack.ProgressPlugin((percent, message) => {
                    const time_has_passed =
                        (new Date() - build_started_at) / 1000 > 3; // 3 seconds
                    if (percent === 1 && time_has_passed) {
                        let now = new Date();
                        Log.notice(
                            'Latest build ready',
                            Log.gray(`at ${now.toTimeString()}`)
                        );
                    }
                })
            );
        }

        var assetServer = new WebpackDevServer(compiler, {
            hot: true,
            contentBase: '/',
            publicPath: '/',
            noInfo: true,
            headers: {
                'Access-Control-Allow-Origin': '*'
            }
        });
        assetServer.listen(DEV_SERVER_PORT, 'localhost', err => {
            if (err) return reject(err);

            Log.info(
                'Server started at',
                Log.bold('http://localhost:' + DEV_SERVER_PORT)
            );
            Log.info(Log.gray('Press Ctrl+C to stop'));
        });
    });
};

module.exports = {
    APP_ROOT_PATH,

    hasWebpackConfig() {
        try {
            require(`${APP_ROOT_PATH}/webpack.config`);
        } catch (e) {
            return false;
        }

        return true;
    },

    webpackConfig(config) {
        return require('./webpack.config')(config);
    },

    build(args, config) {
        args = args || [];
        config = Object.assign({}, { app_root_path: APP_ROOT_PATH }, config);

        return Tasks.clean(args, config)
            .then(() => {
                return Tasks.build(args, config).then(() => {
                    if (!args.includes('hot')) return process.exit();
                    return Tasks.run(args, config);
                });
            })
            .catch(err => {
                Log.error(err);
                process.exit();
            });
    }
};
