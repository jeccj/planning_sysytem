const GLOBAL_NOTICE_POPUP_SHOWN_KEY = 'global-notice-popup-shown:v1'
const SEARCH_DEMO_AUTO_SHOWN_PREFIX = 'search-demo-auto-shown'

const readLocalFlag = (key) => {
    try {
        return localStorage.getItem(key) === '1'
    } catch (error) {
        return false
    }
}

const writeLocalFlag = (key) => {
    try {
        localStorage.setItem(key, '1')
    } catch (error) {
        // Ignore storage write failures in restrictive browser modes.
    }
}

export const hasGlobalNoticePopupShown = () => readLocalFlag(GLOBAL_NOTICE_POPUP_SHOWN_KEY)

export const markGlobalNoticePopupShown = () => writeLocalFlag(GLOBAL_NOTICE_POPUP_SHOWN_KEY)

const getSearchDemoKey = (scope) => `${SEARCH_DEMO_AUTO_SHOWN_PREFIX}:${scope || 'anonymous'}`

export const hasSearchDemoAutoShown = (scope) => readLocalFlag(getSearchDemoKey(scope))

export const markSearchDemoAutoShown = (scope) => writeLocalFlag(getSearchDemoKey(scope))

