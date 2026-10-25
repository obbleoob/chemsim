/* ============================================================================
   ChemSim · core/errors.js
   ----------------------------------------------------------------------------
   Global error logging.
   ============================================================================ */
'use strict';

window.addEventListener('error', (e) => logError('uncaught', e.message, e.error));
window.addEventListener('unhandledrejection', (e) => logError('promise', e.reason));
