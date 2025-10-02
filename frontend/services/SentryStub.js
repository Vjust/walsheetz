const noop = () => {}

const ScopeStub = {
  setTag: noop,
  setContext: noop,
  setExtra: noop,
  setUser: noop
}

const SentryStub = {
  init: noop,
  captureException: () => noop,
  captureMessage: () => noop,
  withScope: (callback) => {
    if (typeof callback === 'function') callback(ScopeStub)
  },
  configureScope: (callback) => {
    if (typeof callback === 'function') callback(ScopeStub)
  }
}

export default SentryStub





