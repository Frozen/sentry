import React from 'react';

import ApiMixin from '../mixins/apiMixin';
import TimeSince from '../components/timeSince';
import LoadingError from '../components/loadingError';
import LoadingIndicator from '../components/loadingIndicator';
import IndicatorStore from '../stores/indicatorStore';
import {t, tn} from '../locale';

const MESSAGES = {
    'native_no_crashed_thread': t('No crashed thread found in crash report'),
    'native_internal_failure': t('Internal failure when attempting to symbolicate: {error}'),
    'native_no_symsynd': t('The symbolizer is not configured for this system.'),
    'native_bad_dsym': t('The debug symbol file used was broken.'),
    'native_missing_optionally_bundled_dsym': t('An optional debug symbol file was missing.'),
    'native_missing_dsym': t('A required debug symbol file was missing.'),
    'native_missing_system_dsym': t('A system debug symbol file was missing.'),
    'native_missing_symbol': t('Unable to resolve a symbol.'),
    'native_simulator_frame': t('Encountered an unprocessable simulator frame.'),
    'native_unknown_image': t('An binary image is referenced that is unknown.')
};

const HELP_LINKS = {
  'native_missing_dsym': 'https://docs.sentry.io/clients/cocoa/dsym/',
  'native_bad_dsym': 'https://docs.sentry.io/clients/cocoa/dsym/',
  'native_missing_system_dsym': 'https://docs.sentry.io/server/dsym/',
  'native_missing_symbol': 'https://docs.sentry.io/server/dsym/',
};


const ProjectProcessingIssues = React.createClass({
  mixins: [ApiMixin],

  getInitialState() {
    return {
      loading: true,
      reprocessing: false,
      error: false,
      processingIssues: null,
    };
  },

  componentDidMount() {
    this.fetchData();
  },

  fetchData() {
    let {orgId, projectId} = this.props.params;
    this.api.request(`/projects/${orgId}/${projectId}/processingissues/?detailed=1`, {
      success: (data, _, jqXHR) => {
        this.setState({
          error: false,
          loading: false,
          processingIssues: data,
          pageLinks: jqXHR.getResponseHeader('Link')
        });
      },
      error: () => {
        this.setState({
          error: true,
          loading: false
        });
      }
    });
  },

  sendReprocessing() {
    this.setState({
      reprocessing: true
    });
    let loadingIndicator = IndicatorStore.add(t('Started reprocessing..'));
    let {orgId, projectId} = this.props.params;
    this.api.request(`/projects/${orgId}/${projectId}/reprocessing/`, {
      method: 'POST',
      success: (data, _, jqXHR) => {
        setTimeout(() => {
          this.fetchData();
          IndicatorStore.remove(loadingIndicator);
          this.setState({
            reprocessing: false
          });
        }, 1000);
      },
      error: () => {
        this.setState({
          reprocessing: false
        });
        IndicatorStore.remove(loadingIndicator);
      }
    });
  },

  renderDebugTable() {
    let body;

    if (this.state.loading)
      body = this.renderLoading();
    else if (this.state.error)
      body = <LoadingError onRetry={this.fetchData} />;
    else if (this.state.processingIssues.hasIssues)
      body = this.renderResults();
    else
      body = this.renderEmpty();

    return body;
  },

  renderLoading() {
    return (
      <div className="box">
        <LoadingIndicator />
      </div>
    );
  },

  renderEmpty() {
    return (
      <div className="box empty-stream">
        <span className="icon icon-exclamation" />
        <p>{t('Good news! There are no processing issues.')}</p>
      </div>
    );
  },

  getProblemDescription(item) {
    let msg = MESSAGES[item.type];
    return msg || item.message || 'Unknown Error';
  },

  getImageName(path) {
    let pathSegments = path.split(/\//g);
    return pathSegments[pathSegments.length - 1];
  },

  renderProblem(item) {
    let description = this.getProblemDescription(item);
    let helpLink = HELP_LINKS[item.type];
    return (
      <div className="processing-issue">
        <span className="description">{description}</span>
        {' '}
        {helpLink &&
          <a href={helpLink} className="help-link"><span className="icon-question" /></a>}
      </div>
    );
  },

  renderDetails(item) {
    let dsymUUID = null;
    let dsymName = null;
    let dsymArch = null;

    if (item.data._scope === 'native') {
      if (item.data.image_uuid) {
        dsymUUID = <code className="uuid">{item.data.image_uuid}</code>;
      }
      if (item.data.image_path) {
        dsymName = <em>{this.getImageName(item.data.image_path)}</em>;
      }
      if (item.data.image_arch) {
        dsymArch = item.data.image_arch;
      }
    }

    return (
      <span>
        {dsymUUID && <span> {dsymUUID}</span>}
        {dsymArch && <span> {dsymArch}</span>}
        {dsymName && <span> (for {dsymName})</span>}
      </span>
    );
  },

  renderResolveButton() {
    let issues = this.state.processingIssues;
    if (issues === null || this.state.reprocessing) {
      return null;
    }
    if (issues.resolveableIssues <= 0) {
      return null;
    }
    let fixButton = tn('Click here to trigger reprocessing for %d pending event',
      'Click here to trigger reprocessing for %d pending events',
      issues.resolveableIssues);
    return (
      <div className="alert alert-block alert-info">
        Pro Tip: <a onClick={this.sendReprocessing}>{fixButton}</a>
      </div>
    );
  },

  renderResults() {
    return (
      <table className="table processing-issues">
        <thead>
          <tr>
            <th>{t('Problem')}</th>
            <th>{t('Details')}</th>
            <th>{t('Events')}</th>
            <th>{t('Last seen')}</th>
          </tr>
        </thead>
        <tbody>
          {this.state.processingIssues.issues.map((item, idx) => {
            return (
              <tr key={idx}>
                <td>{this.renderProblem(item)}</td>
                <td>{this.renderDetails(item)}</td>
                <td>{item.numEvents + ''}</td>
                <td><TimeSince date={item.lastSeen}/></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  },

  render() {
    return (
      <div>
        <h1>{t('Processing Issues')}</h1>
        <p>{t(`
          For some platforms the event processing requires configuration or
          manual action.  If a misconfiguration happens or some necessary
          steps are skipped issues can occur during processing.  In these
          cases you can see all the problems here with guides of how to correct
          them.
        `)}</p>
        {this.renderDebugTable()}
        {this.renderResolveButton()}
      </div>
    );
  }
});

export default ProjectProcessingIssues;