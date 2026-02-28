import { renderHook, act } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import useLayoutController from '../useLayoutController';

// Mock useMediaQuery
const mockUseMediaQuery = jest.fn();
jest.mock('@mui/material', () => ({
  ...jest.requireActual('@mui/material'),
  useMediaQuery: () => mockUseMediaQuery()
}));

const theme = createTheme();

const wrapper = ({ children }) => (
  <ThemeProvider theme={theme}>{children}</ThemeProvider>
);

describe('useLayoutController', () => {
  beforeEach(() => {
    mockUseMediaQuery.mockReturnValue(false); // Default to desktop
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with centered layout state', () => {
    const { result } = renderHook(
      () => useLayoutController(false, false),
      { wrapper }
    );

    expect(result.current.layoutState).toBe('centered');
    expect(result.current.isTransitioning).toBe(false);
    expect(result.current.isMobile).toBe(false);
  });

  it('should transition to output state when hasOutput is true', () => {
    const { result } = renderHook(
      () => useLayoutController(true, false),
      { wrapper }
    );

    expect(result.current.layoutState).toBe('output');
  });

  it('should transition to results state when hasResults is true', () => {
    const { result } = renderHook(
      () => useLayoutController(false, true),
      { wrapper }
    );

    expect(result.current.layoutState).toBe('results');
  });

  it('should prioritize results over output when both are true', () => {
    const { result } = renderHook(
      () => useLayoutController(true, true),
      { wrapper }
    );

    expect(result.current.layoutState).toBe('results');
  });

  it('should detect mobile layout correctly', () => {
    mockUseMediaQuery.mockReturnValue(true);
    
    const { result } = renderHook(
      () => useLayoutController(false, false),
      { wrapper }
    );

    expect(result.current.isMobile).toBe(true);
  });

  it('should provide correct layout config for centered state', () => {
    const { result } = renderHook(
      () => useLayoutController(false, false),
      { wrapper }
    );

    const config = result.current.getLayoutConfig();
    
    expect(config.layoutState).toBe('centered');
    expect(config.inputPosition).toBe('center');
    expect(config.showOutput).toBe(false);
    expect(config.showResults).toBe(false);
    expect(config.inputMaxWidth).toBe('1200px');
  });

  it('should provide correct layout config for output state on desktop', () => {
    const { result } = renderHook(
      () => useLayoutController(true, false),
      { wrapper }
    );

    const config = result.current.getLayoutConfig();
    
    expect(config.layoutState).toBe('output');
    expect(config.inputPosition).toBe('left');
    expect(config.showOutput).toBe(true);
    expect(config.showResults).toBe(false);
    expect(config.inputWidth).toBe('35%');
    expect(config.outputWidth).toBe('65%');
  });

  it('should provide correct layout config for output state on mobile', () => {
    mockUseMediaQuery.mockReturnValue(true);
    
    const { result } = renderHook(
      () => useLayoutController(true, false),
      { wrapper }
    );

    const config = result.current.getLayoutConfig();
    
    expect(config.layoutState).toBe('output');
    expect(config.inputPosition).toBe('bottom');
    expect(config.showOutput).toBe(true);
    expect(config.inputHeight).toBe('40%');
    expect(config.outputHeight).toBe('60%');
  });

  it('should provide correct layout config for results state', () => {
    const { result } = renderHook(
      () => useLayoutController(false, true),
      { wrapper }
    );

    const config = result.current.getLayoutConfig();
    
    expect(config.layoutState).toBe('results');
    expect(config.showResults).toBe(true);
    expect(config.showOutput).toBe(false);
  });

  it('should provide transition styles', () => {
    const { result } = renderHook(
      () => useLayoutController(false, false),
      { wrapper }
    );

    const styles = result.current.getTransitionStyles();
    
    expect(styles.transition).toBe('all 0.3s cubic-bezier(0.4, 0, 0.2, 1)');
    expect(styles.willChange).toBe('auto');
  });

  it('should provide container styles for different layout states', () => {
    const { result } = renderHook(
      () => useLayoutController(false, false),
      { wrapper }
    );

    const styles = result.current.getContainerStyles();
    
    expect(styles.container).toBeDefined();
    expect(styles.container.display).toBe('flex');
    expect(styles.container.transition).toBeDefined();
  });

  it('should handle layout recalculation', () => {
    const { result } = renderHook(
      () => useLayoutController(false, false),
      { wrapper }
    );

    act(() => {
      result.current.recalculateLayout();
    });

    expect(result.current.isTransitioning).toBe(true);
    
    // Wait for transition to complete
    setTimeout(() => {
      expect(result.current.isTransitioning).toBe(false);
    }, 300);
  });
});