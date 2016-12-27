'use strict';

require('./lens.css');

require('script!./lib/jquery.min.js'); // for bootstrap
require('script!./lib/tether.min.js'); // for bootstrap tooltips
require('./lib/bootstrap.min.js'); // for bootstrap
require('./lib/bootstrap.min.css'); // bootstrap
const moment = require('moment');
const tz = require('moment-timezone');

const conf = require('./config.json');

const SampleUtils = require('./SampleUtils');
const Utils = require('./Utils');

require('../../../Helpers/multiline.js');
const handlebars = require('handlebars-template-loader/runtime');

const template = {
  awesome: require('./template/awesome.handlebars'),
  pageHeader: require('./template/pageHeader.handlebars'),
  progress: require('./template/progress.handlebars'),
  sampleModal: require('./template/modal-sample.handlebars'),
  subjectGroup: require('./template/subject-group.handlebars'),
  subjectModal: require('./template/modal-subject.handlebars'),
  aspectModal: require('./template/modal-aspect.handlebars'),
};

const RealtimeChangeHandler = require('./RealtimeChangeHandler');
const SubjectGroups = require('./SubjectGroups');

const LENS = document.getElementById('lens');

let data;

let awesome;
let lastUpdatedMoment;
let lastUpdatedAt;
let lastUpdatedAtRelative;
let loading;
let mt;
let sampleModal;
let subjectModal;
let aspectModal;

LENS.addEventListener('refocus.lens.load', () => {
  LENS.addEventListener('refocus.lens.hierarchyLoad', onHierarchyLoad);
  LENS.addEventListener('refocus.lens.realtime.change', onRealtimeChange);
  LENS.addEventListener('draw', doDraw);
  window.setInterval(() => blinkChecker, conf.blinkerCheckIntervalMillis);
  document.getElementById('errorInfo').setAttribute('hidden', 'true');
  LENS.className = LENS.className + ' container-fluid';

  // Add page header to the page
  const ph = conf.pageHeader;
  lastUpdatedMoment = moment.tz([], moment.tz.guess());
  ph.lastUpdated.date = lastUpdatedMoment.format(conf.dateFormatString);
  ph.lastUpdated.relative = lastUpdatedMoment.fromNow();
  ph.legend.blink.threshold = conf.blinkIfNewStatusThresholdMillis / 60000;
  LENS.insertAdjacentHTML('beforeend', template.pageHeader(ph));
  lastUpdatedAt = document.getElementById('last-updated-at');
  lastUpdatedAtRelative = document.getElementById('last-updated-at-relative');

  // Add change listener to the "Show All" toggle
  document.getElementById('toggle-show-all')
  .addEventListener('change', (evt) => {
    if (data) {
      data.reset(evt.target.checked);
      enqueueDrawEvent();
    }
  });

  // Add progress bar to display while waiting to receive the hierarchy.
  LENS.insertAdjacentHTML('beforeend', template.progress(conf.progress));
  loading = document.getElementById('loading');

  // Add a component to show if everything's OK.
  LENS.insertAdjacentHTML('beforeend', template.awesome(conf.awesome));
  awesome = document.getElementById('awesome');

  // Add the subject, aspect, and sample modals.
  LENS.insertAdjacentHTML('beforeend', '<div id="modal-sample" class="modal fade" tabindex="-1" role="dialog" aria-labelledby="gridModalLabel" aria-hidden="true">');
  sampleModal = document.getElementById('modal-sample');
  LENS.insertAdjacentHTML('beforeend', '<div id="modal-subject" class="modal fade" tabindex="-1" role="dialog" aria-labelledby="gridModalLabel" aria-hidden="true">');
  subjectModal = document.getElementById('modal-subject');
  LENS.insertAdjacentHTML('beforeend', '<div id="modal-aspect" class="modal fade" tabindex="-1" role="dialog" aria-labelledby="gridModalLabel" aria-hidden="true">');
  aspectModal = document.getElementById('modal-aspect');

  // Add the container which holds the tables.
  LENS.insertAdjacentHTML('beforeend', '<div id="multi-table-container" class="row"></div>');
  mt = document.getElementById('multi-table-container');

  // Initialize bootstrap tooltips.
  $(() => $('[data-toggle="tooltip"]').tooltip());
});

/**
 * Handler for the refocus.lens.hierarchyLoad event.
 * (1) Transform the hierarhcy into a data structure which is optimized for
 *     this multi-table layout.
 * (2) Enqueue the draw event.
 * (3) Hide the "Loading..." indicator.
 *
 * @param {CustomEvent} evt - The refocus.lens.hierarchyLoad event.
 */
function onHierarchyLoad(evt) {
  data = new SubjectGroups(evt.detail);
  let showAll = $('#toggle-show-all').prop('checked');
  if (showAll) data.reset(showAll);
  enqueueDrawEvent();
  loading.setAttribute('hidden', 'true');

  window.setInterval(() => {
    lastUpdatedAtRelative.firstChild.nodeValue =
      `(${lastUpdatedMoment.fromNow()})`;
  }, 1000);
} // onHierarchyLoad

/**
 * Handler for refocus.lens.realtime.change event.
 * (1) Update the page header's last udpated time.
 * (2) Iterate over each change in this batch of changes, updating the
 *     SubjectGroups data structure for each change.
 * (3) Once the whole batch of changes has been processed, enqueue the draw
 *     event.
 *
 * @param {CustomEvent} evt - The refocus.lens.realtime.change event.
 */
function onRealtimeChange(evt) {
  lastUpdatedMoment = moment.tz([], moment.tz.guess());
  lastUpdatedAt.firstChild.nodeValue =
    lastUpdatedMoment.format(conf.dateFormatString);
  if (Array.isArray(evt.detail) && evt.detail.length > 0) {
    evt.detail.forEach((chg) => RealtimeChangeHandler.handle(chg, data));
    enqueueDrawEvent();
  }
} // onRealtimeChange

/**
 * Sweeps through all the blinking cells checking whether any cell should stop
 * blinking (i.e. if the elapsed time since the status changed exceeds the
 * configured threshold).
 */
function blinkChecker() {
  const blinkers = mt.querySelectorAll('.blink');
  for (let i = 0; i < blinkers.length; i++) {
    const cell = blinkers[i];
    const n = SubjectGroups.groupName(cell.id);
    const sample = data.getSubjectGroup(n).samples[cell.id.toLowerCase()];
    if (sample && SampleUtils.statusChangedRecently(sample,
      conf.blinkIfNewStatusThresholdMillis)) {
      cell.className = cell.className.replace(/blink blink-\w+/, '');
    }
  }
} // blinkChecker

function enqueueDrawEvent() {
  LENS.dispatchEvent(new CustomEvent('draw', {
    detail: preparePanelsToDraw(),
  }));
}

/**
 * This function modifies the DOM.
 */
function doDraw(evt) {
  const panels = evt.detail;
  mt.innerHTML = '';
  if (panels.length) {
    awesome.setAttribute('hidden', true);
    panels.forEach((p) => {
      mt.insertAdjacentHTML('beforeend', p.template);
      setSampleListeners(p.subjectGroup);
      setSubjectListeners(p.subjectGroup);
      setAspectListeners(p.subjectGroup);
    });
  } else {
    awesome.removeAttribute('hidden');
  }
} // doDraw

function preparePanelsToDraw() {
  return data.getPanelsToDraw().map((subjectGroup) => {
    const ctx = subjectGroup.tableContext(data.rootSubject);
    return {
      subjectGroup: subjectGroup,
      template: template.subjectGroup(ctx),
    }
  });
} // getPanelsToDraw

function bindContentToModal(modal, modalTemplate, context, content) {
  context.data = content;
  const str = modalTemplate(context);
  modal.innerHTML = '';
  modal.insertAdjacentHTML('beforeend', str);
} // bindContentToModal

function setSampleListeners(subjectGroup) {
  const samples = document.getElementById(subjectGroup.name)
    .querySelectorAll('.sample');
  samples.forEach((sample) => {
    sample.addEventListener('click', (evt) => {
      const s = subjectGroup.samples[evt.target.dataset.sampleId.toLowerCase()];
      s.updatedAtFormatted = moment.tz(s.updatedAt, moment.tz.guess()).format(conf.dateFormatString);
      s.statusChangedAtFormatted = moment.tz(s.statusChangedAt,
        moment.tz.guess()).format(conf.dateFormatString);
      if (s.aspect.tags && s.aspect.tags.length > 1) {
        s.aspect.tags.sort(Utils.sort);
      }

      if (s.relatedLinks && s.relatedLinks.length > 1) {
        s.relatedLinks.sort(Utils.sort);
      }
      bindContentToModal(sampleModal, template.sampleModal,
        conf.modal.sample, s);
      $('#modal-sample').modal(); // open the modal
    });
  });
} // setSampleListeners

function setSubjectListeners(subjectGroup) {
  const subjects = document.getElementById(subjectGroup.name)
    .querySelectorAll('.subject');
  subjects.forEach((subject) => {
    subject.addEventListener('click', (evt) => {
      const s = evt.target.dataset.subjectId.toLowerCase() ===
        subjectGroup.name.toLowerCase() ? subjectGroup.self :
        subjectGroup.subjects[evt.target.dataset.subjectId.toLowerCase()];
      s.updatedAtFormatted = moment.tz(s.updatedAt,
        moment.tz.guess()).format(conf.dateFormatString);
      if (s.tags && s.tags.length > 1) {
        s.tags.sort(Utils.sort);
      }

      if (s.relatedLinks && s.relatedLinks.length > 1) {
        s.relatedLinks.sort(Utils.sortByNameAscending);
      }
      bindContentToModal(subjectModal, template.subjectModal,
        conf.modal.subject, s);
      $('#modal-subject').modal(); // open the modal
    });
  });
} // setSubjectListeners

function setAspectListeners(subjectGroup) {
  const aspectElements = document.getElementById(subjectGroup.name)
                                 .querySelectorAll('.aspect');
  let aspectObjects = new Map();
  let samples = Object.values(subjectGroup.samples);
  samples.forEach((sample) => {
    aspectObjects.set(sample.aspect.name, sample.aspect);
  });

  aspectElements.forEach((aspectElement) => {
    aspectElement.addEventListener('click', (evt) => {

      let aspectName = evt.target.innerHTML;
      let aspect = aspectObjects.get(aspectName);

      if (aspect.tags && aspect.tags.length > 1) {
        aspect.tags.sort(Utils.sort);
      }

      bindContentToModal(aspectModal, template.aspectModal,
        conf.modal.aspect, aspect);
      $('#modal-aspect').modal(); // open the modal
      
    });
  });
} // setAspectListeners

handlebars.registerHelper('flattenRange', function(range) {
  if (range == null) {
    return null;
  } else if (range[0] == range[1]) {
    return range[0];
  } else {
    return range[0] + ' - ' + range[1];
  }
});