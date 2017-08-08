const FS = require('fs-extra');
const Webpack = require('webpack');

const Log = require('./log');

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

function appRoot() {
    if (process.env.APP_ROOT) return process.env.APP_ROOT;

    let current_directory = process.cwd();
    let project_directory = null;

    let levels = 50;
    while (current_directory.length > 0 && !project_directory && levels-- > 0) {
        if (
            FS.readdirSync(current_directory).includes('node_modules') ||
            FS.readdirSync(current_directory).includes('package.json')
        ) {
            project_directory = current_directory;
        } else {
            current_directory = Path.dirname(current_directory);
        }
    }

    return project_directory;
}

const APP_ROOT_PATH = appRoot();

function auntyConfig() {
    try {
        const config = require(`${APP_ROOT_PATH}/package.json`);
        return config.aunty || {};
    } catch (e) {
        return {};
    }
}

const AUNTY_CONFIG = auntyConfig();
const DEV_SERVER_PORT =
    AUNTY_CONFIG.serve && AUNTY_CONFIG.serve.port
        ? AUNTY_CONFIG.serve.port
        : 8000;

// Load the webpack config and apply hot reload options if needed
function webpackConfig(args, config, logged) {
    config = config || {};
    args = args || [];

    clearRequireCache(`${config.app_root_path}/webpack.config`);
    let webpack_config = require(`${config.app_root_path}/webpack.config`);
    if (typeof webpack_config === 'function') {
        webpack_config = webpack_config(config);
    }

    // See if we need to build it for FTP
    if (args.includes('ftp') || args.includes('release')) {
        // TODO: handle other release targets

        if (logged) {
            Log.info('Building for', Log.bold.magenta('FTP'));
        }

        try {
            const { execSync } = require('child_process');

            const package_config = require(`${APP_ROOT_PATH}/package.json`);
            const name = package_config.name;

            let path_id;
            if (args.includes('--id')) {
                path_id = args[args.indexOf('--id') + 1];
            } else {
                path_id = execSync(`git branch | grep '*'`)
                    .toString()
                    .split('\n')[0]
                    .replace('* ', '');
            }

            const ftp_to = package_config.aunty.deploy.contentftp.to
                .replace('/www', '//www.abc.net.au')
                .replace('<name>', name)
                .replace('<id>', path_id);

            webpack_config.output.publicPath = ftp_to + '/';

            if (logged) {
                Log.info(
                    'Detected asset path:',
                    Log.bold(webpack_config.output.publicPath)
                );
            }
        } catch (e) {
            Log.error('Building for FTP failed.');
            Log.error(e);

            process.exit();
        }
    } else if (args.includes('hot')) {
        if (logged) {
            Log.info('Building with', Log.bold.magenta('Hot Reload'));
        }

        const port = config.port || DEV_SERVER_PORT;
        const url = `http://${config.hostname || '0.0.0.0'}:${port}`;

        let entry = webpack_config.entry;
        if (typeof webpack_config.entry === 'string') {
            webpack_config.entry = [
                `webpack-dev-server/client?${url}`,
                'webpack/hot/dev-server',
                webpack_config.entry
            ];
        } else if (webpack_config.entry instanceof Array) {
            webpack_config.entry.unshift(
                `webpack-dev-server/client?${url}`,
                'webpack/hot/dev-server'
            );
        } else {
            Object.keys(webpack_config.entry).forEach(entry => {
                if (typeof webpack_config.entry[entry] === 'string') {
                    webpack_config.entry[entry] = [
                        `webpack-dev-server/client?${url}`,
                        'webpack/hot/dev-server',
                        webpack_config.entry[entry]
                    ];
                } else {
                    webpack_config.entry[entry].unshift(
                        `webpack-dev-server/client?${url}`,
                        'webpack/hot/dev-server'
                    );
                }
            });
        }

        webpack_config.output.publicPath = `${url}/`;
        webpack_config.plugins.push(new Webpack.HotModuleReplacementPlugin());
    } else if (logged) {
        Log.info('Building');
    }

    return webpack_config;
}

module.exports = {
    APP_ROOT_PATH,
    AUNTY_CONFIG,
    DEV_SERVER_PORT,
    clearRequireCache,
    webpackConfig
};
