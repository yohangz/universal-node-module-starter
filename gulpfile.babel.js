import gulp from 'gulp';
import gulpFile from 'gulp-file';
import clean from 'gulp-clean';

import { rollup, watch } from 'rollup';
import rollupTypescript from 'rollup-plugin-typescript2';
import rollupResolve from 'rollup-plugin-node-resolve';
import rollupCommonjs from 'rollup-plugin-commonjs';
import rollupReplace from 'rollup-plugin-re'
import rollupIgnore from 'rollup-plugin-ignore';
import { uglify } from 'rollup-plugin-uglify';
import rollupTsLint from 'rollup-plugin-tslint';
import rollupSass from 'rollup-plugin-sass';
import rollupSassLint from 'rollup-plugin-sass-lint';
import rollupLivereload from 'rollup-plugin-livereload';
import rollupServe from 'rollup-plugin-serve';
import rollupImage from 'rollup-plugin-img';
import rollupHandlebars from './plugins/rollup-plugin-handlebars';
import rollupFilesize from 'rollup-plugin-filesize';
import rollupProgress from 'rollup-plugin-progress';
import rollupIgnoreImport from './plugins/rollup-plugin-ignore-import';

import postCss from 'postcss';
import postCssAutoPrefix from 'autoprefixer';
import postCssImageInline from 'postcss-image-inliner';

import typescript from 'typescript';
import merge from 'lodash/merge';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';

import packageJson from './package.json';

// Configuration

const config = {
  namespace: 'ts.lib',
  entry: 'index.ts',
  source: `${__dirname}/src`,
  out: `${__dirname}/dist`,
  watch: {
    script: `${__dirname}/.tmp`,
    demo: `${__dirname}/demo/watch`,
    port: 4000,
    open: true
  },
  copy: ['README.md', 'LICENSE'],
  umdGlobals: {},
  esmExternals: [
    'handlebars/runtime'
  ],
  pathReplacePatterns: [
    {
      test: /\.\/conf\/conf1/g,
      replace: './conf/conf2',
    }
  ],
  ignore: [],
  imageInlineLimit: 1000000,
  assetPaths: [`${__dirname}/src/assets`],
  partialRoots: [`${__dirname}/src/templates`]
};

// Build utils

const baseConfig = {
  input: `${config.source}/${config.entry}`,
  output: {
    name: packageJson.name,
    sourcemap: true
  }
};

const makeDir = (name) => {
  if (!fs.existsSync(name)){
    fs.mkdirSync(name);
  }
};

const rollupStyleBuildPlugin = (watch) => {
  return rollupSass({
    output: (styles, styleNodes) => {
      const styleDist = `${watch? config.watch.script: config.out}/style`;
      makeDir(styleDist);

      styleNodes.reduce((acc, node) => {
        const baseName = path.basename(node.id);
        const currentNode = acc.find(accNode => accNode.name === baseName);
        if (currentNode) {
          currentNode.styles += node.content;
        } else {
          acc.push({
            name: baseName,
            styles: node.content
          });
        }

        return acc;
      }, []).forEach((node) => {
        fs.writeFileSync(`${styleDist}/${node.name.slice(0, -4)}css`, node.styles);
      });
    },
    processor: (css) => {
      return postCss([
        postCssImageInline({
          maxFileSize: config.imageInlineLimit,
          assetPaths: config.assetPaths
        }),
        postCssAutoPrefix,
      ])
        .process(css, { from: undefined })
        .then(result => result.css)
    }
  })
};

const rollupReplacePlugin = rollupReplace({
  patterns: config.pathReplacePatterns
});

const resolvePlugins = [
  rollupIgnore(config.ignore),
  rollupResolve({
    jsnext: true,
    main: true,
    browser: true,
    preferBuiltins: false
  }),
  rollupCommonjs({
    include: 'node_modules/**'
  })
];

const tsBuildPlugin = (esVersion, generateDefinition) => {
  let buildConf = {
    tsconfig: `tsconfig.${esVersion}.json`,
    typescript: typescript
  };

  if (generateDefinition) {
    buildConf.tsconfigOverride  = {
      compilerOptions: {
        declaration: true,
        declarationDir: config.out
      }
    };

    buildConf.useTsconfigDeclarationDir = true;
  }

  return rollupTypescript(buildConf);
};

const lintPlugins = [
  rollupTsLint({
    include: [`${config.source}/**/*.ts`]
  }),
  rollupSassLint({
    include: 'src/**/*.scss',
  })
];

const preBundlePlugins = () => {
  return [
    rollupReplacePlugin,
    rollupHandlebars(),
    rollupImage({
      extensions: /\.(png|jpg|jpeg|gif|svg)$/,
      limit: config.imageInlineLimit,
      exclude: 'node_modules/**'
    })
  ];
};

const ignoreImportPlugin = rollupIgnoreImport({
  extensions: ['.scss']
});

// Clean tasks

gulp.task('build:clean', () => {
  return gulp.src(['.rpt2_cache', config.out], {
      read: false,
      allowEmpty: true
    })
    .pipe(clean());
});

gulp.task('watch:clean', () => {
  return gulp.src(['.rpt2_cache', config.watch.script], {
    read: false,
    allowEmpty: true
  })
    .pipe(clean());
});

// Base build tasks

gulp.task('build:copy:essentials', () => {
  let fieldsToCopy = ['name', 'version', 'description', 'keywords', 'author', 'repository', 'license', 'bugs', 'homepage'];

  let targetPackage = {
    main: `bundles/${packageJson.name}.umd.js`,
    module: `fesm5/${packageJson.name}.js`,
    es2015: `fesm2015/${packageJson.name}.js`,
    fesm5: `fesm5/${packageJson.name}.js`,
    fesm2015: `fesm2015/${packageJson.name}.js`,
    typings: 'index.d.ts',
    peerDependencies: {}
  };

  //only copy needed properties from project's package json
  fieldsToCopy.forEach((field) => targetPackage[field] = packageJson[field]);

  // defines project's dependencies as 'peerDependencies' for final users
  Object.keys(packageJson.dependencies).forEach((dependency) => {
    targetPackage.peerDependencies[dependency] = `^${packageJson.dependencies[dependency].replace(/[\^~><=]/, '')}`;
  });

  // copy the needed additional files in the 'dist' folder
  return gulp.src(config.copy)
    .pipe(gulpFile('package.json', JSON.stringify(targetPackage, null, 2)))
    .pipe(gulp.dest(config.out))
});

gulp.task('build:bundle', async () => {
  // UMD bundle.
  const umdConfig = merge({}, baseConfig, {
    output: {
      name: config.namespace,
      format: 'umd',
      file: path.join(config.out, 'bundles', `${packageJson.name}.umd.js`),
      globals: config.umdGlobals
    },
    external: Object.keys(config.umdGlobals),
    plugins: [
      ...lintPlugins,
      rollupStyleBuildPlugin(false),
      ...preBundlePlugins(),
      tsBuildPlugin('es5', true),
      ...resolvePlugins,
    ]
  });

  // MIN UMD bundle.
  const minifiedUmdConfig = merge({}, baseConfig, {
    output: {
      name: config.namespace,
      format: 'umd',
      file: path.join(config.out, 'bundles', `${packageJson.name}.umd.min.js`),
      globals: config.umdGlobals
    },
    external: Object.keys(config.umdGlobals),
    plugins: [
      ignoreImportPlugin,
      ...preBundlePlugins(),
      tsBuildPlugin('es5', false),
      ...resolvePlugins,
      uglify(),
      rollupFilesize(),
    ]
  });

  // FESM+ES5 flat module bundle.
  const fesm5config = merge({}, baseConfig, {
    output: {
      format: 'es',
      file: path.join(config.out, 'fesm5', `${packageJson.name}.es5.js`),
    },
    plugins: [
      ignoreImportPlugin,
      ...preBundlePlugins(),
      tsBuildPlugin('es5', false),
    ],
    external: config.esmExternals
  });

  // FESM+ES2015 flat module bundle.
  const fesm2015config = merge({}, baseConfig, {
    output: {
      format: 'es',
      file: path.join(config.out, 'fesm2015', `${packageJson.name}.js`),
    },

    plugins: [
      ignoreImportPlugin,
      ...preBundlePlugins(),
      tsBuildPlugin('es2015', false),
    ],
    external: config.esmExternals
  });

  const allBundles = [
    umdConfig,
    minifiedUmdConfig,
    fesm5config,
    fesm2015config
  ].map(async (rollupConf) => {
    try {
      const bundleResult = await rollup(rollupConf);
      await bundleResult.write(rollupConf.output);
    } catch (error) {
      console.log(chalk.red('Bundle build Failure'));
      console.log(error);
    }
  });

  await Promise.all(allBundles);
});

gulp.task('build', gulp.series('build:clean', 'build:copy:essentials', 'build:bundle'));

// Watch tasks

gulp.task('build:watch', async () => {
  makeDir(config.watch.script);

  const watchConfig = merge({}, baseConfig, {
    output: {
      name: config.namespace,
      format: 'umd',
      file: path.join(config.watch.script, `${packageJson.name}.umd.js`),
      globals: config.umdGlobals
    },
    external: Object.keys(config.umdGlobals),
    plugins: [
      ...lintPlugins,
      ...preBundlePlugins(),
      tsBuildPlugin('es5', false),
      ...resolvePlugins,
      rollupServe({
        contentBase: [config.watch.script, config.watch.demo],
        port: config.watch.port,
        open: config.watch.open,
      }),
      rollupLivereload({
        watch: [config.watch.script, config.watch.demo]
      }),
      rollupProgress()
    ],
    watch: {
      exclude: ['node_modules/**']
    }
  });

  try {
    const watcher = await watch(watchConfig);
    watcher.on('event', event => {
      switch (event.code) {
        case 'START':
          console.log(chalk.blue('[WATCH] ') + chalk.yellow('bundling start'));
          break;
        case 'END':
          console.log(chalk.blue('[WATCH] ') + chalk.yellow('bundling end'));
          break;
        case 'ERROR':
          console.log(chalk.blue('[WATCH] ') + chalk.red('bundling failure'));
          console.log(event.error);
          break;
        case 'FATAL':
          console.log(chalk.blue('[WATCH] ') + chalk.red('bundling crashed'));
          console.log(event);
          break;
      }
    });
  } catch(error) {
    console.log(chalk.blue('[WATCH] ') + chalk.red('watch task failure'));
  }
});

gulp.task('watch', gulp.series('watch:clean', 'build:watch'));