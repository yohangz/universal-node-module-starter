export default function ignoreImport(options = {}) {
  return {
    transform(code, id) {
      if (!options.extensions.some(ext => id.endsWith(ext))) {
        return;
      }

      return {
        code: '',
        map: { mappings: '' }
      };
    }
  };
}