const Webpack = require('webpack');
const AutoPrefixer = require('autoprefixer');
const Path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

const { APP_ROOT_PATH } = require('.');

module.exports = config => {
    config = Object.assign(
        {},
        {
            environment: process.env.NODE_ENV || 'development',
            app_root_path:
                config && config.app_root_path
                    ? config.app_root_path
                    : APP_ROOT_PATH,
            show_deprecations: false,
            use_css_modules: true
        },
        config
    );

    if (config.show_deprecations) {
        process.traceDeprecation = true;
    } else {
        process.noDeprecation = true;
    }

    const PRODUCTION = config.environment.toUpperCase() === 'PRODUCTION';

    let webpack_config = {
        cache: true,
        entry: {
            client: [`${config.app_root_path}/src/index.js`]
        },
        output: {
            path: `${config.app_root_path}/build`,
            publicPath: '/',
            filename: 'index.js'
        },
        module: {
            rules: [
                {
                    test: /\.js$/,
                    exclude: /node_modules/,
                    loader: 'babel-loader',
                    options: {
                        presets: ['es2015'],
                        plugins: [
                            [
                                'transform-react-jsx',
                                {
                                    pragma: 'Preact.h'
                                }
                            ]
                        ]
                    }
                },
                {
                    test: /\.(css|scss)$/,
                    use: [
                        {
                            loader: 'style-loader'
                        },
                        PRODUCTION
                            ? {
                                  loader: 'css-loader',
                                  options: {
                                      modules: config.use_css_modules,
                                      camelCase: true,
                                      minimize: true
                                  }
                              }
                            : {
                                  loader: 'css-loader',
                                  options: {
                                      modules: config.use_css_modules,
                                      camelCase: true,
                                      sourcemaps: true,
                                      localIdentName: config.use_css_modules
                                          ? '[path]__[name]__[local]--[hash:base64:5]'
                                          : '[local]'
                                  }
                              },
                        {
                            loader: 'postcss-loader',
                            options: {
                                config: {
                                    path: `${__dirname}/postcss.config.js`
                                }
                            }
                        },
                        {
                            loader: 'sass-loader'
                        }
                    ]
                },
                {
                    test: /\.(jpg|png|gif|mp4|m4v|flv|mp3|wav|m4a)$/,
                    loader: 'file-loader',
                    options: {
                        name: '[name]-[hash].[ext]'
                    }
                },
                {
                    test: /\.(woff|woff2)(\?v=\d+\.\d+\.\d+)?$/,
                    loader: 'url-loader',
                    options: {
                        limit: 10000,
                        mimetype: 'application/font-woff'
                    }
                },
                {
                    test: /\.ttf(\?v=\d+\.\d+\.\d+)?$/,
                    loader: 'url-loader',
                    options: {
                        limit: 10000,
                        mimetype: 'application/octet-stream'
                    }
                },
                {
                    test: /\.eot(\?v=\d+\.\d+\.\d+)?$/,
                    loader: 'file-loader'
                },
                {
                    test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,
                    loader: 'url-loader',
                    options: {
                        limit: 10000,
                        mimetype: 'image/svg+xml'
                    }
                },
                {
                    test: /\.html$/,
                    loader: 'html-loader'
                }
            ]
        },
        plugins: [
            new Webpack.LoaderOptionsPlugin({
                options: {
                    postcss: [AutoPrefixer()]
                }
            }),
            new Webpack.EnvironmentPlugin(Object.keys(process.env)),
            new CopyPlugin([
                {
                    from: `${config.app_root_path}/public`
                }
            ])
        ]
    };

    if (PRODUCTION) {
        webpack_config.plugins.push(new Webpack.optimize.UglifyJsPlugin());
    } else {
        webpack_config.plugins.push(new Webpack.NamedModulesPlugin());
    }

    return webpack_config;
};
