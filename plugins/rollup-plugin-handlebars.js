import Handlebars from 'handlebars';
import path from 'path';

/**
 * Constructs a Rollup plugin to compile Handlebars templates.
 *
 *  @param {Object} options
 *  @param {String|Object=} options.handlebars - Handlebars options. If this is a string it is a
 *    shortcut for passing `id` as below.
 *  @param {String=} options.handlebars.id - The module ID of the Handlebars runtime. Defaults to
 *     the path of its UMD definition within this module, which guarantees compatibility and will
 *     be simple for you _assuming_ you're using `rollup-plugin-node-resolve` and `rollup-plugin-commonjs`.
 *  @param {Object=} options.handlebars.options - Options to pass to Handlebars' parse and precompile
 *     steps.
 *  @param {Boolean=true} options.handlebars.options.sourceMap - Whether to generate sourcemaps.
 *  @param {String='.hbs'} templateExtension - The file extension of your templates.
 *  @param {Function=} isPartial - A function that can determine whether or not a template is a
 *    partial. Defaults to determining if the template's name is prefixed with a '_'.
 *
 * @return {Object} The rollup plugin object, as documented on the wiki:
 *   https://github.com/rollup/rollup/wiki/Plugins#creating-plugins
 */
export default (options) => {
  options = Object.assign({
    templateExtension: '.hbs',
    isPartial: (name) => name.startsWith('_')
  }, options);

  options.handlebars = Object.assign({
    id: (typeof options.handlebars === 'string') ? options.handlebars : 'handlebars/runtime'
  }, options.handlebars);

  options.handlebars.options = Object.assign({
    sourceMap: true
  }, options.handlebars.options);

  return {
    transform(code, id) {
      if (!id.endsWith(options.templateExtension)) return;

      const name = id.split('/').pop();
      const tree = Handlebars.parse(code, options.handlebars.options);

      const precompileOptions = options.handlebars.options;
      if (precompileOptions.sourceMap && !precompileOptions.srcName) {
        precompileOptions.srcName = name;
      }

      let template = Handlebars.precompile(tree, precompileOptions);
      let map = null;
      if (precompileOptions.sourceMap) {
        map = template.map;
        template = template.code;
      }

      const escapePath = path => path.replace(/\\/g, '\\\\');

      let body = `import Handlebars from '${escapePath(options.handlebars.id)}';\n`;

      body += `var Template = Handlebars.template(${template});\n`;
      if (options.isPartial(name)) {
        let partialName = id;

        if (partialName.endsWith(options.templateExtension)) {
          partialName = path.basename(partialName).slice(0, -options.templateExtension.length);
        }
        body += `Handlebars.registerPartial('${partialName}', Template);\n`;
      }

      body += `export default function(data, options) {\n`;
      body += `  return Template(data, options);\n`;
      body += `};\n`;

      return {
        code: body,
        map: map || { mappings: '' }
      };
    }
  };
}

