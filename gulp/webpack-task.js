let path = require('path');
let util = require('gulp-util');
let config = require('./config.json');
let webpack = require('webpack');
let getFilename = require('./get-filename');
let scssToJson = require('scss-to-json');

let EventEmitter = require('events');

let CleanObsoleteChunks = require('webpack-clean-obsolete-chunks');
let CleanWebpackPlugin = require('clean-webpack-plugin');
let BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
let CompressionPlugin = require('compression-webpack-plugin');
let UglifyJsPlugin = require('uglifyjs-webpack-plugin');
let MiniCssExtractPlugin = require('mini-css-extract-plugin');
let OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');

// Paths and filenames
let rootPath = path.resolve(__dirname, config.paths.root) + '/';
let sourcesPath = rootPath + config.paths.sources;
let entryScriptsPath = rootPath + config.paths.sources + config.dirs.js + config.files.scriptsSource;
let entryStylesPath = rootPath + config.paths.sources + config.dirs.sass + config.files.stylesSource;
let outputPath = rootPath + config.paths.sources + config.paths.temp + config.dirs.assets;
let outputScriptsFilename = config.files.scriptsResults;
let outputStylesFilename = config.files.stylesResults;
let cleanPath = rootPath + config.paths.results + config.dirs.assets;
let scssVariablesPath = rootPath + config.paths.sources + config.dirs.sass + config.webpack.scssVariables;
let globalsPath = rootPath + config.paths.sources + config.dirs.twig + config.files.twigGlobals;

let globals = require(globalsPath);

process.traceDeprecation = true;

class WebpackTask extends EventEmitter {
    constructor() {
        super();
        this.isProduction = null;
        this.webpackConfig = null;
        this.compiler = null;
    }

    generateConfig() {
        this.webpackConfig = {};

        this.commonConfig();

        if(this.isProduction) {
            this.productionConfig();
        } else {
            this.developmentConfig();
        }
    }

    commonConfig() {
        let cfg = this.webpackConfig;

        cfg.entry = config.webpack.windowJquery ? ['jquery'] : [];
        cfg.entry.push('es6-promise/auto'); // Polyfill dla dynamicznych importów w IE
        cfg.entry.push(entryScriptsPath);
        cfg.entry.push(entryStylesPath);

        cfg.output = {
            path: outputPath,
            filename: getFilename(outputScriptsFilename, this.isProduction),
            chunkFilename: config.webpack.chunksName,
            publicPath: config.webpack.publicPath
        };

        cfg.externals = {
            scss: JSON.stringify(scssToJson(scssVariablesPath)),
            globals: JSON.stringify(globals)
        };

        cfg.node = {
            fs: 'empty' // Żeby twig się nie czepiał o brak modułu fs
        };

        cfg.resolve = {
            alias: {
                sources: sourcesPath // Żeby nie pisać relatywnych ścieżek
            }
        };

        cfg.watch = !this.isProduction; // Bo korzystamy z watchera webpackowego
        cfg.context = rootPath; // Webpack ma działać w ramach tego katalogu

        cfg.plugins = [];

        // Usuwa wcześniej generowane chunki z temp
        cfg.plugins.push(new CleanObsoleteChunks());

        // Czyści katalog wynikowy w dist
        cfg.plugins.push(new CleanWebpackPlugin([cleanPath], {
            verbose: false,
            dry: false,
            watch: true,
            root: rootPath
        }));

        if(config.webpack.moduleJquery) {
            // Automatycznie ładuje moduł jquery do każdego modułu
            cfg.plugins.push(new webpack.ProvidePlugin({
                $: 'jquery',
                jQuery: 'jquery'
            }));
        }

        if(config.webpack.showPolyfills) {
            cfg.plugins.push(new webpack.LoaderOptionsPlugin({
                debug: true
            }));
        }

        cfg.module = {
            rules: [
                {
                    test: /\.mp3$/,
                    use: [
                        {
                            loader: 'url-loader',
                            options: {
                                limit: 10000,
                                name: '[name]-[hash:4].[ext]'
                            }
                        }
                    ]
                },
                {
                    test: /\.twig$/,
                    use: [
                        {
                            loader: 'twig-loader'
                        }
                    ]
                },
                {
                    test: /\.dot/,
                    use: [
                        {
                            loader: 'dot-loader'
                        }
                    ]
                },
                {
                    test: /\.(jpg|png|gif)/,
                    use: [
                        {
                            loader: 'url-loader',
                            options: {
                                limit: 10000,
                                name: '[name]-[hash:4].[ext]'
                            }
                        }
                    ]
                },
                {
                    test: /\.(woff|woff2|eot|ttf|svg)/,
                    use: [
                        {
                            loader: 'file-loader',
                            options: {
                                name: '[name]-[hash:4].[ext]'
                            }
                        }
                    ]
                },
                {
                    test: /\.jsx?$/,
                    exclude: /(node_modules|bower_components|js\/vendor)/,
                    use: [
                        {
                            loader: 'babel-loader',
                            options: {
                                presets: [['@babel/env', {
                                    targets: {
                                        browsers: config.webpack.browsers
                                    },
                                    corejs: 3,
                                    useBuiltIns: 'usage',
                                    debug: config.webpack.showPolyfills
                                }], '@babel/react'],
                                plugins: [
                                    '@babel/plugin-syntax-dynamic-import', // webpackowy codesplitting
                                    '@babel/plugin-transform-runtime',
                                    '@babel/plugin-proposal-class-properties'
                                ],
                                cacheDirectory: true
                            }
                        }
                    ]
                }
            ]
        };

        if(config.webpack.windowJquery) {
            cfg.module.rules.push({
                test: require.resolve('jquery'),
                use: [
                    {
                        loader: 'expose-loader',
                        options: 'jQuery'
                    },
                    {
                        loader: 'expose-loader',
                        options: '$'
                    }
                ]
            });
        }

        // Konfiguracja dla css

        // Wyciąga css do oddzielnego pliku
        cfg.plugins.push(new MiniCssExtractPlugin({
            filename: getFilename(outputStylesFilename, this.isProduction)
        }));

        // Zakmnięcie wszystkich cssów w jednej cachegroup żeby wszystkie wpadły do
        // jednego pliku css
        cfg.optimization = {
            splitChunks: {
                cacheGroups: {
                    styles: {
                        name: 'styles',
                        test: /\.css$/,
                        chunks: 'all',
                        enforce: true
                    }
                }
            }
        };
    }

    developmentConfig() {
        let cfg = this.webpackConfig;

        cfg.mode = 'development';
        //cfg.devtool = 'cheap-eval-source-map'; // Szybszy build ale słabe sourcemap
        cfg.devtool = 'source-map'; // Wolniejszy build ale pełne sourcemap
        cfg.cache = true;


        // Konfiguracja css z mapami
        cfg.module.rules.push({
            test: /\.s?[ac]ss$/,
            use: [
                {
                    loader: MiniCssExtractPlugin.loader
                },
                {
                    loader: 'css-loader',
                    options: { url: false, sourceMap: true }
                },
                {
                    loader: 'postcss-loader',
                    options: {
                        sourceMap: true,
                        plugins: function() { return [
                            require('autoprefixer')({
                                browsers: config.webpack.browsers,
                                remove: false,
                                grid: false
                            })
                        ]; }
                    }
                },
                {
                    loader: 'sass-loader',
                    options: { sourceMap: true }
                }
            ]
        });
    }

    productionConfig() {
        let cfg = this.webpackConfig;

        cfg.mode = 'production';
        cfg.devtool = false;
        cfg.cache = false;

        // Tworzy raport z wielkości paczki
        if(config.webpack.moduleReport) {
            cfg.plugins.push(new BundleAnalyzerPlugin({
                analyzerMode: 'static',
                reportFilename: 'report.html',
                openAnalyzer: false,
                logLevel: 'silent'
            }));
        }

        // Gzippuje bundla - warto zerknąć jaką ma wielkość po gzippowaniu
        if(config.webpack.gzipAssets) {
            cfg.plugins.push(new CompressionPlugin({
                asset: '[path].gz',
                algorithm: 'gzip',
                test: /\.(js|css)$/,
                threshold: 10240,
                minRatio: 0.8
            }));
        }

        // Zmienne globalne (istotne dla reactowych buildow produkcyjnych)
        cfg.plugins.push(new webpack.DefinePlugin({
            PRODUCTION: JSON.stringify(true),
            VERSION: JSON.stringify('5fa3b9'),
            BROWSER_SUPPORTS_HTML5: true,
            TWO: '1+1',
            'typeof window': JSON.stringify('object'),
            'process.env.NODE_ENV': JSON.stringify('production')
        }));

        // Minifikacja
        cfg.optimization.minimizer = [
            new UglifyJsPlugin({
                cache: true,
                parallel: true,
                sourceMap: false // set to true if you want JS source maps
            }),
            new OptimizeCSSAssetsPlugin({})
        ];

        // Konfiguracja css bez map - to produkcja wiec ma byc szybkie
        cfg.module.rules.push({
            test: /\.s?[ac]ss$/,
            use: [
                {
                    loader: MiniCssExtractPlugin.loader
                },
                {
                    loader: 'css-loader',
                    options: { url: false }
                },
                {
                    loader: 'postcss-loader',
                    options: {
                        plugins: function() { return [
                            require('autoprefixer')({
                                browsers: config.webpack.browsers,
                                remove: false,
                                grid: false
                            })
                        ]; }
                    }
                },
                {
                    loader: 'sass-loader'
                }
            ]
        });

        return cfg;
    }

    log(err, stats, resolve, reject) {
        if (err) {
            reject(new util.PluginError('webpack', err));
        }
        if(config.webpack.showAssets) {
            util.log(stats.toString({
                assets: true,
                colors: true,
                chunks: false,
                chunkModules: false,
                modules: false,
                children: false,
                cached: false,
                reasons: false,
                source: false,
                errorDetails: false,
                chunkOrigins: false,
                modulesSort: false,
                chunksSort: false,
                assetsSort: false,
                warnings: false,
                exclude: ['core-js', 'babel-runtime', 'babel-polyfill', 'babel-regenerator-runtime']
            }));
        }
        resolve();
    }

    run(isProduction = this.isProduction) {
        // Ustawienie rodzaju buildu
        this.isProduction = isProduction;

        // Generowanie configa jeżeli nie istnieje
        if(!this.webpackConfig) {
            this.generateConfig();
        }

        // Tworzenie kompilatora jeżeli to produkcja lub jeżeli kompilator nie istnieje
        if (this.isProduction || !this.compiler) {
            this.compiler = webpack(this.webpackConfig);
            this.compiler.hooks.compile.tap({name: 'boilerplate'}, this.emit.bind(this, 'start'));
        }

        // Uruchomienie kompilacji
        return new Promise((resolve, reject) => {
            if(this.isProduction) {
                this.compiler.run((err, stats) => {
                    this.log(err, stats, resolve, reject);
                    this.emit('end');
                });
            } else {
                this.compiler.watch({}, (err, stats) => {
                    this.log(err, stats, resolve, reject);
                    this.emit('end');
                });
            }
        });
    }
}

module.exports = WebpackTask;
