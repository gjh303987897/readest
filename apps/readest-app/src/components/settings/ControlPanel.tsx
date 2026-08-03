import React, { useEffect, useRef, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useReaderStore } from '@/store/readerStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useBookDataStore } from '@/store/bookDataStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useResetViewSettings } from '@/hooks/useResetSettings';
import { useEinkMode } from '@/hooks/useEinkMode';
import { getStyles } from '@/utils/style';
import { getMaxInlineSize } from '@/utils/config';
import { saveSysSettings, saveViewSettings } from '@/helpers/settings';
import { PageTurnStyle } from '@/types/book';
import { SettingsPanelPanelProp } from './SettingsDialog';
import { applyPageTurnAttributes } from '@/app/reader/hooks/useCapturedTurn';
import { isTauriAppPlatform } from '@/services/environment';
import { BoxedList, SettingsRow, SettingsSelect, SettingsSwitchRow } from './primitives';
import NumberInput from './NumberInput';
import PageTurnerSettings from './PageTurnerSettings';

const ControlPanel: React.FC<SettingsPanelPanelProp> = ({ bookKey, onRegisterReset }) => {
  const _ = useTranslation();
  const { envConfig, appService } = useEnv();
  const { getView, getViews, getViewSettings, recreateViewer } = useReaderStore();
  const { getBookData } = useBookDataStore();
  const { settings } = useSettingsStore();
  const { applyEinkMode } = useEinkMode();
  const bookData = getBookData(bookKey);
  const viewSettings = getViewSettings(bookKey) || settings.globalViewSettings;

  const [isScrolledMode, setScrolledMode] = useState(viewSettings.scrolled);
  const [noContinuousScroll, setNoContinuousScroll] = useState(viewSettings.noContinuousScroll);
  const [scrollingOverlap, setScrollingOverlap] = useState(viewSettings.scrollingOverlap);
  const [hideScrollbar, setHideScrollbar] = useState(viewSettings.hideScrollbar || false);
  const [showPaginationButtons, setShowPaginationButtons] = useState(
    viewSettings.showPaginationButtons,
  );
  const [isDisableClick, setIsDisableClick] = useState(viewSettings.disableClick);
  const [isDisableSwipe, setIsDisableSwipe] = useState(viewSettings.disableSwipe);
  const [fullscreenClickArea, setFullscreenClickArea] = useState(viewSettings.fullscreenClickArea);
  const [swapClickArea, setSwapClickArea] = useState(viewSettings.swapClickArea);
  const [isDisableDoubleClick, setIsDisableDoubleClick] = useState(viewSettings.disableDoubleClick);
  const [animated, setAnimated] = useState(viewSettings.animated);
  const [pageTurnStyle, setPageTurnStyle] = useState(viewSettings.pageTurnStyle || 'push');
  const [isEink, setIsEink] = useState(viewSettings.isEink);
  const [isColorEink, setIsColorEink] = useState(viewSettings.isColorEink);
  const [autoScreenBrightness, setAutoScreenBrightness] = useState(settings.autoScreenBrightness);
  const [swipeBrightnessGesture, setSwipeBrightnessGesture] = useState(
    settings.swipeBrightnessGesture,
  );
  const [screenWakeLock, setScreenWakeLock] = useState(settings.screenWakeLock);
  const [autohideCursor, setAutohideCursor] = useState(settings.autohideCursor);
  const [allowScript, setAllowScript] = useState(viewSettings.allowScript);

  const resetToDefaults = useResetViewSettings();
  const pageTurnerResetRef = useRef<() => void>(() => {});

  // The layered styles need an engine with full View Transitions support or
  // the Tauri captured-turn fallback; engines like iOS 18 WebKit crash on
  // the VT turns, so on the web they only get Push (readest#555).
  const turnStyleOptions = [
    { value: 'push', label: _('Push') },
    ...(appService?.supportsViewTransitionGroup || isTauriAppPlatform()
      ? [
          { value: 'slide', label: _('Slide') },
          { value: 'curl', label: _('Page Curl') },
        ]
      : []),
  ];

  const handleReset = () => {
    resetToDefaults({
      scrolled: setScrolledMode,
      noContinuousScroll: setNoContinuousScroll,
      scrollingOverlap: setScrollingOverlap,
      hideScrollbar: setHideScrollbar,
      showPaginationButtons: setShowPaginationButtons,
      disableClick: setIsDisableClick,
      disableSwipe: setIsDisableSwipe,
      swapClickArea: setSwapClickArea,
      animated: setAnimated,
      isEink: setIsEink,
      allowScript: setAllowScript,
      fullscreenClickArea: setFullscreenClickArea,
      disableDoubleClick: setIsDisableDoubleClick,
    });
    pageTurnerResetRef.current();
  };

  useEffect(() => {
    onRegisterReset(handleReset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isScrolledMode === viewSettings.scrolled) return;
    saveViewSettings(envConfig, bookKey, 'scrolled', isScrolledMode);
    getView(bookKey)?.renderer.setAttribute('flow', isScrolledMode ? 'scrolled' : 'paginated');
    getView(bookKey)?.renderer.setAttribute(
      'max-inline-size',
      `${getMaxInlineSize(viewSettings)}px`,
    );
    getView(bookKey)?.renderer.setStyles?.(getStyles(viewSettings!));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScrolledMode]);

  useEffect(() => {
    if (noContinuousScroll === viewSettings.noContinuousScroll) return;
    saveViewSettings(envConfig, bookKey, 'noContinuousScroll', noContinuousScroll);
    if (noContinuousScroll) {
      getView(bookKey)?.renderer.setAttribute('no-continuous-scroll', '');
    } else {
      getView(bookKey)?.renderer.removeAttribute('no-continuous-scroll');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noContinuousScroll]);

  useEffect(() => {
    saveViewSettings(envConfig, bookKey, 'hideScrollbar', hideScrollbar, false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hideScrollbar]);

  useEffect(() => {
    if (scrollingOverlap === viewSettings.scrollingOverlap) return;
    saveViewSettings(envConfig, bookKey, 'scrollingOverlap', scrollingOverlap, false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollingOverlap]);

  useEffect(() => {
    saveViewSettings(
      envConfig,
      bookKey,
      'showPaginationButtons',
      showPaginationButtons,
      false,
      false,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPaginationButtons]);

  useEffect(() => {
    saveViewSettings(envConfig, bookKey, 'disableClick', isDisableClick, false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDisableClick]);

  // The renderer reads `turn-style`/`no-swipe` at touchmove/touchend time, so
  // settings changes have to push the attributes through immediately rather
  // than waiting for the next recreateViewer pass.
  const applyTurnAttributes = () => {
    const view = getView(bookKey);
    const freshSettings = getViewSettings(bookKey);
    if (view && freshSettings) {
      applyPageTurnAttributes(view, freshSettings, !!bookData?.isFixedLayout);
    }
  };

  useEffect(() => {
    saveViewSettings(envConfig, bookKey, 'disableSwipe', isDisableSwipe, false, false);
    applyTurnAttributes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDisableSwipe]);

  useEffect(() => {
    saveViewSettings(envConfig, bookKey, 'disableDoubleClick', isDisableDoubleClick, false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDisableDoubleClick]);

  useEffect(() => {
    saveViewSettings(envConfig, bookKey, 'fullscreenClickArea', fullscreenClickArea, false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreenClickArea]);

  useEffect(() => {
    saveViewSettings(envConfig, bookKey, 'swapClickArea', swapClickArea, false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapClickArea]);

  useEffect(() => {
    saveViewSettings(envConfig, bookKey, 'animated', animated, false, false);
    if (animated) {
      getView(bookKey)?.renderer.setAttribute('animated', '');
    } else {
      getView(bookKey)?.renderer.removeAttribute('animated');
    }
    // Mesh-curl eligibility depends on `animated`.
    applyTurnAttributes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animated]);

  useEffect(() => {
    saveViewSettings(envConfig, bookKey, 'pageTurnStyle', pageTurnStyle, false, false);
    applyTurnAttributes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTurnStyle]);

  useEffect(() => {
    saveViewSettings(envConfig, bookKey, 'isEink', isEink);
    if (isEink) {
      getView(bookKey)?.renderer.setAttribute('eink', '');
    } else {
      getView(bookKey)?.renderer.removeAttribute('eink');
    }
    applyEinkMode(isEink);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEink]);

  useEffect(() => {
    saveViewSettings(envConfig, bookKey, 'isColorEink', isColorEink);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isColorEink]);

  useEffect(() => {
    if (autoScreenBrightness === settings.autoScreenBrightness) return;
    saveSysSettings(envConfig, 'autoScreenBrightness', autoScreenBrightness);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScreenBrightness]);

  useEffect(() => {
    if (swipeBrightnessGesture === settings.swipeBrightnessGesture) return;
    saveSysSettings(envConfig, 'swipeBrightnessGesture', swipeBrightnessGesture);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swipeBrightnessGesture]);

  useEffect(() => {
    if (screenWakeLock === settings.screenWakeLock) return;
    saveSysSettings(envConfig, 'screenWakeLock', screenWakeLock);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenWakeLock]);

  useEffect(() => {
    if (autohideCursor === settings.autohideCursor) return;
    saveSysSettings(envConfig, 'autohideCursor', autohideCursor);
    getViews().forEach((view) => view?.toggleAttribute('autohide-cursor', autohideCursor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autohideCursor]);

  useEffect(() => {
    if (viewSettings.allowScript === allowScript) return;
    saveViewSettings(envConfig, bookKey, 'allowScript', allowScript, true, false).then(() => {
      recreateViewer(envConfig, bookKey);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowScript]);

  return (
    <div className='my-4 w-full space-y-6'>
      <BoxedList title={_('Scroll')} data-setting-id='settings.control.scrolledMode'>
        <SettingsSwitchRow
          label={_('Scrolled Mode')}
          checked={isScrolledMode}
          disabled={bookData?.isFixedLayout}
          onChange={() => setScrolledMode(!isScrolledMode)}
        />
        <SettingsSwitchRow
          label={_('Single Section Scroll')}
          checked={noContinuousScroll}
          disabled={!viewSettings.scrolled}
          onChange={() => setNoContinuousScroll(!noContinuousScroll)}
          data-setting-id='settings.control.scroll.noContinuousScroll'
        />
        <NumberInput
          label={_('Overlap Pixels')}
          value={scrollingOverlap}
          onChange={setScrollingOverlap}
          disabled={!viewSettings.scrolled}
          min={0}
          max={200}
          step={10}
          data-setting-id='settings.control.overlapPixels'
        />
        <SettingsSwitchRow
          label={_('Hide Scrollbar')}
          checked={hideScrollbar}
          disabled={!viewSettings.scrolled}
          onChange={() => setHideScrollbar(!hideScrollbar)}
          data-setting-id='settings.control.scroll.hideScrollbar'
        />
      </BoxedList>

      <BoxedList title={_('Pagination')} data-setting-id='settings.control.clickToPaginate'>
        <SettingsSwitchRow
          label={appService?.isMobileApp ? _('Tap to Paginate') : _('Click to Paginate')}
          checked={!isDisableClick}
          onChange={() => setIsDisableClick(!isDisableClick)}
        />
        <SettingsSwitchRow
          label={_('Swipe to Paginate')}
          checked={!isDisableSwipe}
          onChange={() => setIsDisableSwipe(!isDisableSwipe)}
          data-setting-id='settings.control.swipeToPaginate'
        />
        <SettingsSwitchRow
          label={appService?.isMobileApp ? _('Tap Both Sides') : _('Click Both Sides')}
          checked={fullscreenClickArea}
          disabled={isDisableClick}
          onChange={() => setFullscreenClickArea(!fullscreenClickArea)}
          data-setting-id='settings.control.clickBothSides'
        />
        <SettingsSwitchRow
          label={appService?.isMobileApp ? _('Swap Tap Sides') : _('Swap Click Sides')}
          checked={swapClickArea}
          disabled={isDisableClick || fullscreenClickArea}
          onChange={() => setSwapClickArea(!swapClickArea)}
          data-setting-id='settings.control.swapClickSides'
        />
        <SettingsSwitchRow
          label={appService?.isMobileApp ? _('Disable Double Tap') : _('Disable Double Click')}
          checked={isDisableDoubleClick}
          onChange={() => setIsDisableDoubleClick(!isDisableDoubleClick)}
          data-setting-id='settings.control.disableDoubleClick'
        />
        <SettingsSwitchRow
          label={_('Show Page Navigation Buttons')}
          checked={showPaginationButtons}
          onChange={() => setShowPaginationButtons(!showPaginationButtons)}
          data-setting-id='settings.control.showPaginationButtons'
        />
      </BoxedList>

      <PageTurnerSettings
        bookKey={bookKey}
        onRegisterReset={(fn) => {
          pageTurnerResetRef.current = fn;
        }}
      />

      <BoxedList title={_('Animation')} data-setting-id='settings.control.pagingAnimation'>
        <SettingsSwitchRow
          label={_('Paging Animation')}
          checked={animated}
          onChange={() => setAnimated(!animated)}
        />
        <SettingsRow label={_('Animation Style')} data-setting-id='settings.control.pageTurnStyle'>
          <SettingsSelect
            // A synced slide/curl setting from another device still reads as
            // push here when this engine cannot animate it.
            value={
              turnStyleOptions.some((opt) => opt.value === pageTurnStyle) ? pageTurnStyle : 'push'
            }
            onChange={(e) => setPageTurnStyle(e.target.value as PageTurnStyle)}
            ariaLabel={_('Animation Style')}
            options={turnStyleOptions}
            disabled={!animated}
          />
        </SettingsRow>
      </BoxedList>

      <BoxedList title={_('Device')} data-setting-id='settings.control.device'>
        {(appService?.isAndroidApp || appService?.appPlatform === 'web') && (
          <SettingsSwitchRow
            label={_('E-Ink Mode')}
            checked={isEink}
            onChange={() => setIsEink(!isEink)}
            data-setting-id='settings.control.einkMode'
          />
        )}
        {(appService?.isAndroidApp || appService?.appPlatform === 'web') && (
          <SettingsSwitchRow
            label={_('Color E-Ink Mode')}
            checked={isColorEink}
            disabled={!isEink}
            onChange={() => setIsColorEink(!isColorEink)}
            data-setting-id='settings.control.colorEinkMode'
          />
        )}
        {appService?.isMobileApp && (
          <SettingsSwitchRow
            label={_('System Screen Brightness')}
            checked={autoScreenBrightness}
            onChange={() => setAutoScreenBrightness(!autoScreenBrightness)}
          />
        )}
        {appService?.hasScreenBrightness && (
          <SettingsSwitchRow
            label={_('Swipe for Brightness')}
            description={_('Slide along the left edge')}
            checked={swipeBrightnessGesture}
            onChange={() => setSwipeBrightnessGesture(!swipeBrightnessGesture)}
            data-setting-id='settings.control.swipeBrightnessGesture'
          />
        )}
        <SettingsSwitchRow
          label={_('Keep Screen Awake')}
          description={_('Only while reading')}
          checked={screenWakeLock}
          onChange={() => setScreenWakeLock(!screenWakeLock)}
          data-setting-id='settings.control.screenWakeLock'
        />
        {!appService?.isMobile && (
          <SettingsSwitchRow
            label={_('Auto-hide Cursor')}
            description={_('After a moment of inactivity')}
            checked={autohideCursor}
            onChange={() => setAutohideCursor(!autohideCursor)}
            data-setting-id='settings.control.autohideCursor'
          />
        )}
      </BoxedList>

      <BoxedList title={_('Security')} data-setting-id='settings.control.allowJavascript'>
        <SettingsSwitchRow
          label={_('Allow JavaScript')}
          description={_('Enable only if you trust the file.')}
          checked={allowScript}
          disabled={bookData?.book?.format !== 'EPUB'}
          onChange={() => setAllowScript(!allowScript)}
        />
      </BoxedList>
    </div>
  );
};

export default ControlPanel;
