const Path = require('path');
const { hostname } = require('os');
const FS = require('fs-extra');
const Webpack = require('webpack');
const Log = require('./log');
const {
    APP_ROOT_PATH,
    AUNTY_CONFIG,
    DEV_SERVER_PORT,
    clearRequireCache,
    webpackConfig
} = require('./util');

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
            disableHostCheck: true,
            contentBase: '/',
            publicPath: '/',
            noInfo: true,
            headers: {
                'Access-Control-Allow-Origin': '*'
            }
        });
        assetServer.listen(DEV_SERVER_PORT, '0.0.0.0', err => {
            if (err) return reject(err);

            Log.info(
                'Server started at',
                Log.bold('http://' + hostname() + ':' + DEV_SERVER_PORT)
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
            if (!e.message.includes('Cannot find module')) {
                throw e;
            }

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

        if (args.includes('serve')) {
            args.push('hot');
        }

        return Tasks.clean(args, config)
            .then(() => {
                return Tasks.build(args, config).then(() => {
                    if (args.includes('release')) return true; // Aunty will take it from here

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
