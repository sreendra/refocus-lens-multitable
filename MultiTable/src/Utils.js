/**
 * Some general helper functions.
 */
'use strict';

module.exports = class Utils {

  static inventory(subject) {
    const inv = {
      samples: {},
      subjects: {},
    };
    if (subject.absolutePath) {
      inv.subjects[subject.absolutePath.toLowerCase()] = subject;
      if (subject.samples && subject.samples.length) {
        subject.samples.forEach((sample) =>
          inv.samples[sample.name.toLowerCase()] = sample);
      }

      if (subject.children && subject.children.length) {
        subject.children.forEach((d) => {
          const childInv = Utils.inventory(d);
          // merge childInv.subject into inv.subjects
          Object.assign(inv.subjects, childInv.subjects);
          // merge childInv.samples into inv.samples
          Object.assign(inv.samples, childInv.samples);
        });
      }
    }
    return inv;
  } // inventory

  static sort(a, b) {
    if (a > b) return 1;
    if (a < b) return -1;
    return 0;
  }
  /**
   * Use this sort function to sort an array of objects in ascending order by
   * name (not case sensitive).
   */
  static sortByNameAscending(a, b) {
    return Utils.sort(a.name.toLowerCase() || '', b.name.toLowerCase() || '');
  } // sortByNameAscending

} // module.exports
