/**
 * TODO: custom error handling
 */

'use strict';

const
    fs = require('fs'),
    path = require('path'),
    del = require('del'),
    gulp = require('gulp'),
    plugins = require('gulp-load-plugins')(),
    chalk = require('chalk'),
    WebpackTask = require('./webpack-task'),
    getFilename = require('./get-filename'),
    config = require('./config.json');

class Log {
    about() {
        console.log(' _____ _____\n|     |     |\n|  K  |  2  |  GULP\n|_____|_____|\n');
        this.printTaskInfo('build', 'production', 'cleans enviroment, compiles and compress all files');
        this.printTaskInfo('build', 'dev', 'cleans enviroment, compiles all files, runs watcher');
        this.printTaskInfo('', 'run', 'hand picket queue of methods to run');
        console.log('');
    }

    printTaskInfo(group, name, description) {
        console.log(
            chalk.bgMagenta(group + chalk.bold((group.length ? ':' : '') + name)) + chalk.dim(` - ${description}`)
        );
    }

    error(message) {
        this.print(chalk.red(message));
    }

    print(message) {
        plugins.util.log(message);
    }
}

class Timer {
    constructor() {
        this.timestamp = new Date().getTime();
    }

    print() {
        return `${((new Date().getTime() - this.timestamp) / 1000).toFixed(2)}s`;
    }
}

class Tasks {
    constructor() {
        this.log = new Log();
        this.webpackTask = new WebpackTask();
        this.paths = {
            stylesSource: config.paths.root + config.paths.sources + config.dirs.sass,
            scriptsSource: config.paths.root + config.paths.sources + config.dirs.js,
            scriptsVendors: config.paths.root + config.paths.sources + config.dirs.js + config.dirs.exclude,
            assetsTemp: config.paths.root + config.paths.sources + config.paths.temp + config.dirs.assets,
            assetsResult: config.paths.root + config.paths.results + config.dirs.assets,
            imagesSource: config.paths.root + config.paths.sources + config.dirs.img,
            imagesTemp: config.paths.root + config.paths.sources + config.paths.temp + config.dirs.img,
            imagesResult: config.paths.root + config.paths.results + config.dirs.img,
            templatesSource: config.paths.root + config.paths.sources + config.dirs.twig,
            templatesTemp: config.paths.root + config.paths.sources + config.paths.temp + config.dirs.html,
            templatesResult: config.paths.root + config.paths.results + config.dirs.html,
            temp: config.paths.root + config.paths.sources + config.paths.temp,
            public: config.paths.root + config.paths.results
        };
    }

    getPath(path) {
        if (!this.paths[path]) this.log.error(`Path "${path}" does not exist, build will probably won't work`);

        return this.paths[path];
    }

    conditional(condition, output, options) {
        return plugins.if(condition, condition ? output.apply(this, options ? options : null) : plugins.rename(''));
    }

    compileAssets() {
        let duration = null;

        this.webpackTask.on('start', () => {
            duration = new Timer();
        });

        this.webpackTask.on('end', () => {
            this.log.print(`✔ Finished building assets in ${duration.print()}`);
        });

        return this.webpackTask.run(this.production);
    }

    compileTwig(src = this.getPath('templatesSource') + (config.settings.twig ? '*.twig' : '**/*.html')) {
        let duration = new Timer();

        return new Promise(resolve => {
            fs.readFile(this.getPath('templatesSource') + config.files.twigGlobals, (err, _globals) => {
                gulp.src(src)
                .pipe(plugins.twig({data: JSON.parse(_globals)}))
                .pipe(gulp.dest(this.getPath('templatesTemp')))
                .on('end', () => {
                    this.log.print(`✔ Finished building html in ${duration.print()}`);
                    resolve();
                });
            });
        });
    }

    injectFiles() {
        let duration = new Timer();

        return new Promise(resolve => {
            gulp.src(this.getPath('templatesTemp') + '*.html')
            .pipe(plugins.inject(
                gulp.src([
                    this.getPath('assetsTemp') + getFilename(config.files.stylesResults, this.production),
                    this.getPath('assetsTemp') + getFilename(config.files.scriptsResults, this.production)
                ], { read: false }), { relative: config.settings.injectPathsRelative, quiet: true}
            ))
            .pipe(this.conditional(
                this.production,
                plugins.htmlmin,
                [{collapseWhitespace: true, removeComments: true}]
            ))
            .pipe(gulp.dest(this.getPath('templatesTemp')))
            .on('end', () => {
                this.log.print(`✔ Finished injecting static files in ${duration.print()}`);
                resolve();
            });
        });
    }

    compressImages() {
        let duration = new Timer();

        return new Promise(resolve => {
            gulp.src(this.getPath('imagesSource') + '**/*')
            .pipe(plugins.newer(this.getPath('imagesTemp')))
            .pipe(this.conditional(this.production, plugins.imagemin, [
                [
                    plugins.imagemin.gifsicle(),
                    plugins.imagemin.jpegtran(),
                    require('imagemin-pngquant')(),
                    plugins.imagemin.svgo()
                ],
                {
                    progressive: true,
                    interlaced: true
                }
            ]))
            .pipe(gulp.dest(this.getPath('imagesTemp')))
            .on('end', () => {
                this.log.print(`✔ Finished moving images in ${duration.print()}`);
                resolve();
            });
        });
    }

    cleanPublic() {
        return new Promise(resolve => {
            del([
                this.getPath('assetsResult'),
                this.getPath('imagesResult'),
                this.getPath('templatesResult') + (config.dirs.html.length ? '' : '*.html')
            ], {force: true}).then(() => resolve());
        });
    }

    cleanTemp() {
        return new Promise(resolve => {
            del([
                this.getPath('temp')
            ], {force: true}).then(() => resolve());
        });
    }

    publish(dir = '**/', mask = '**') {
        return new Promise(resolve => {
            gulp.src(this.getPath('temp') + dir + mask)
            .pipe(gulp.dest(this.getPath('public')))
            .on('end', resolve);
        });
    }

    buildProduction() {
        this.production = true;

        return new Promise(resolve => {
            this.cleanTemp()
            .then(this.compileAssets.bind(this))
            .then(this.compressImages.bind(this))
            .then(this.compileTwig.bind(this))
            .then(this.injectFiles.bind(this))
            .then(this.cleanPublic.bind(this))
            .then(this.publish.bind(this))
            //.then(this.cleanTemp.bind(this))
            .then(() => {
                this.log.print('✔ Production build finished');
                resolve();
            })
            .catch(console.log);
        });
    }

    buildDev() {
        this.production = false;

        return new Promise(resolve => {
            this.cleanTemp()
            .then(this.compileAssets.bind(this))
            .then(this.compressImages.bind(this))
            .then(this.compileTwig.bind(this))
            .then(this.injectFiles.bind(this))
            .then(this.cleanPublic.bind(this))
            .then(this.publish.bind(this))
            .then(this.watch.bind(this))
            .then(resolve)
            .catch(console.log);;
        });
    }

    test() {
        return new Promise(resolve => {

        });
    }

    watch() {
        this.log.print('Started files watcher');

        if(config.settings.livereload.enabled) {
            gulp.src(this.getPath('public'))
                .pipe(plugins.serverLivereload(config.settings.livereload))
                .on('end', () => {
                    this.log.print('Serving ' + this.getPath('public'));
                });
        }

        //gulp.watch(this.getPath('stylesSource') + '**/*', () => {
        //    this.compileAssets()
        //    .then(this.publish.bind(this, config.dirs.assets.replace('/', '*/')));
        //});
        //gulp.watch(this.getPath('scriptsSource') + '**/*', () => {
        //    this.compileAssets()
        //    .then(this.publish.bind(this, config.dirs.assets.replace('/', '*/')));
        //});
        // Podpięcie watchera gulpowego żeby templatki w środku działały
        this.webpackTask.on('end', this.publish.bind(this, config.dirs.assets.replace('/', '*/')));

        gulp.watch(this.getPath('imagesSource') + '**/*', () => {
            this.compressImages()
            .then(this.publish.bind(this, config.dirs.img.replace('/', '*/')));
        });
        gulp.watch(
            [this.getPath('templatesSource') + '*/**', this.getPath('templatesSource') + config.files.twigGlobals],
            () => {
                this.compileTwig()
                .then(this.injectFiles.bind(this))
                .then(this.publish.bind(this, config.dirs.html.replace('/', '*/'), '*.html'));
            }
        );
        gulp.watch(this.getPath('templatesSource') + '*.twig', e => {
            this.compileTwig(e.path)
            .then(this.injectFiles.bind(this))
            .then(this.publish.bind(this, config.dirs.html.replace('/', '*/'), '*.html'));
        });
    }

    about() {
        this.log.about();
    }
}

const tasks = new Tasks();

gulp.task('build:production', () => tasks.buildProduction());
gulp.task('build:dev', () => tasks.buildDev());
gulp.task('test', () => tasks.test());
gulp.task('default', () => tasks.about());
