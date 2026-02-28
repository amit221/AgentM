import { createTheme } from '@mui/material/styles';

// Cache themes to avoid recreation
const themeCache = new Map();

// Clear cache when theme changes (for development)
if (process.env.NODE_ENV === 'development') {
  themeCache.clear();
}

// Create a custom MUI theme that matches the current Tailwind design
export const createAppTheme = (mode) => {
  // Return cached theme if available
  if (themeCache.has(mode)) {
    return themeCache.get(mode);
  }

  const theme = createTheme({
    palette: {
      mode,
       primary: {
         50: mode === 'dark' ? 'rgba(41, 132, 215, 0.05)' : '#eff6ff',
         100: mode === 'dark' ? 'rgba(41, 132, 215, 0.10)' : '#dbeafe',
         200: mode === 'dark' ? 'rgba(41, 132, 215, 0.20)' : '#bfdbfe',
         300: mode === 'dark' ? 'rgba(41, 132, 215, 0.30)' : '#93c5fd',
         400: '#60a5fa',
         500: '#3b82f6',
         600: '#2984D7',
         700: '#1d4ed8',
         800: '#1e40af',
         900: '#1e3a8a',
         main: '#2984D7', // primary-600
         light: '#3b82f6', // primary-500
         dark: '#1d4ed8', // primary-700
       },
      // Standard icon colors for better visual distinction
      warning: {
        main: '#f59e0b', // amber-500
        light: '#fbbf24', // amber-400
        dark: '#d97706', // amber-600
      },
      error: {
        main: '#ef4444', // red-500
        light: '#f87171', // red-400
        dark: '#dc2626', // red-600
      },
       info: {
         50: mode === 'dark' ? 'rgba(59, 130, 246, 0.05)' : '#eff6ff',
         200: mode === 'dark' ? 'rgba(59, 130, 246, 0.20)' : '#bfdbfe',
         700: mode === 'dark' ? '#60a5fa' : '#1d4ed8',
         main: '#3b82f6', // blue-500
         light: '#60a5fa', // blue-400
         dark: '#2563eb', // blue-600
       },
       success: {
         main: '#16a34a', // green-600 (moved the old primary green here for success states)
         light: '#22c55e', // green-500
         dark: '#15803d', // green-700
       },
      ...(mode === 'light'
        ? {
            // Light mode colors
            background: {
              default: '#f9fafb', // gray-50
              paper: '#ffffff',
            },
            text: {
              primary: '#111827', // gray-900
              secondary: '#6b7280', // gray-500
            },
            grey: {
              50: '#f9fafb',
              100: '#f3f4f6',
              200: '#e5e7eb',
              300: '#d1d5db',
              400: '#9ca3af',
              500: '#6b7280',
              600: '#4b5563',
              700: '#374151',
              800: '#1f2937',
              900: '#111827',
            },
            action: {
              hover: 'rgba(0, 0, 0, 0.04)',
              selected: 'rgba(41, 132, 215, 0.08)',
              disabled: 'rgba(0, 0, 0, 0.26)',
              disabledBackground: 'rgba(0, 0, 0, 0.12)',
            },
          }
        : {
            // Dark mode colors
            background: {
              default: '#111827', // gray-900
              paper: '#1f2937', // gray-800
            },
             text: {
               primary: '#f9fafb', // gray-50
               secondary: '#9ca3af', // gray-400
             },
             grey: {
               50: '#111827',  // Inverted for dark theme
               100: '#1f2937', // Inverted for dark theme
               200: '#374151', // Inverted for dark theme
               300: '#4b5563', // Inverted for dark theme
               400: '#6b7280',
               500: '#9ca3af',
               600: '#d1d5db',
               700: '#e5e7eb',
               800: '#f3f4f6',
               900: '#f9fafb',
             },
            action: {
              hover: 'rgba(255, 255, 255, 0.08)',
              selected: 'rgba(41, 132, 215, 0.16)',
              disabled: 'rgba(255, 255, 255, 0.3)',
              disabledBackground: 'rgba(255, 255, 255, 0.12)',
            },
          }),
    },
    typography: {
      fontFamily: ['Inter', 'system-ui', 'sans-serif'].join(','),
      h1: {
        fontWeight: 600,
      },
      h2: {
        fontWeight: 600,
      },
      h3: {
        fontWeight: 600,
      },
      h4: {
        fontWeight: 600,
      },
      h5: {
        fontWeight: 600,
      },
      h6: {
        fontWeight: 600,
      },
      body1: {
        fontSize: '0.875rem', // 14px
      },
      body2: {
        fontSize: '0.75rem', // 12px
      },
    },
    shape: {
      borderRadius: 6, // Matches rounded-md
    },
    zIndex: {
      modal: 1300,
      tooltip: 1200,
      snackbar: 1400,
    },
    components: {
       MuiButton: {
         styleOverrides: {
           root: {
             textTransform: 'none',
             fontWeight: 500,
             borderRadius: 6,
             paddingX: 16,
             paddingY: 8,
             '&:focus': {
               outline: 'none',
               boxShadow: '0 0 0 2px rgba(41, 132, 215, 0.5)',
             },
           },
           containedPrimary: {
             backgroundColor: '#2984D7',
             '&:hover': {
               backgroundColor: '#1d4ed8',
             },
           },
           outlinedError: {
             borderColor: mode === 'dark' ? '#ef4444' : '#ef4444',
             color: mode === 'dark' ? '#f87171' : '#ef4444',
             '&:hover': {
               borderColor: mode === 'dark' ? '#dc2626' : '#dc2626',
               backgroundColor: mode === 'dark' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.04)',
             },
           },
         },
       },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: 6,
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: mode === 'dark' ? '#4b5563' : '#d1d5db',
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: '#2984D7',
                borderWidth: 1,
              },
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            border: mode === 'dark' ? '1px solid #374151' : '1px solid #e5e7eb',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            border: mode === 'dark' ? '1px solid #374151' : '1px solid #e5e7eb',
            boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 8,
            backgroundColor: mode === 'dark' ? '#1f2937' : '#ffffff',
            border: mode === 'dark' ? '1px solid #374151' : '1px solid #e5e7eb',
          },
        },
        defaultProps: {
          container: () => document.body,
        },
      },
       MuiChip: {
         styleOverrides: {
           root: {
             borderRadius: 6,
           },
           filled: {
             '&.MuiChip-colorPrimary': {
               backgroundColor: mode === 'dark' ? '#2984D7' : '#2984D7',
               color: '#ffffff',
               fontWeight: 600,
               '& .MuiChip-icon': {
                 color: '#ffffff',
               },
             },
             '&.MuiChip-colorSuccess': {
               backgroundColor: mode === 'dark' ? '#16a34a' : '#16a34a',
               color: '#ffffff',
               fontWeight: 600,
               '& .MuiChip-icon': {
                 color: '#ffffff',
               },
             },
             '&.MuiChip-colorSecondary': {
               backgroundColor: mode === 'dark' ? '#6b7280' : '#6b7280',
               color: '#ffffff',
               fontWeight: 500,
               '& .MuiChip-icon': {
                 color: '#ffffff',
               },
             },
             '&.MuiChip-colorDefault': {
               backgroundColor: mode === 'dark' ? '#374151' : '#f3f4f6',
               color: mode === 'dark' ? '#f9fafb' : '#374151',
               fontWeight: 500,
               '& .MuiChip-icon': {
                 color: mode === 'dark' ? '#9ca3af' : '#6b7280',
               },
             },
           },
           outlined: {
             '&.MuiChip-colorPrimary': {
               borderColor: mode === 'dark' ? '#2984D7' : '#2984D7',
               color: mode === 'dark' ? '#60a5fa' : '#2984D7',
               '& .MuiChip-icon': {
                 color: mode === 'dark' ? '#60a5fa' : '#2984D7',
               },
             },
             '&.MuiChip-colorSuccess': {
               borderColor: mode === 'dark' ? '#16a34a' : '#16a34a',
               color: mode === 'dark' ? '#22c55e' : '#16a34a',
               '& .MuiChip-icon': {
                 color: mode === 'dark' ? '#22c55e' : '#16a34a',
               },
             },
             '&.MuiChip-colorSecondary': {
               borderColor: mode === 'dark' ? '#6b7280' : '#9ca3af',
               color: mode === 'dark' ? '#9ca3af' : '#6b7280',
               '& .MuiChip-icon': {
                 color: mode === 'dark' ? '#9ca3af' : '#6b7280',
               },
             },
             '&.MuiChip-colorDefault': {
               borderColor: mode === 'dark' ? '#4b5563' : '#d1d5db',
               color: mode === 'dark' ? '#d1d5db' : '#6b7280',
               '& .MuiChip-icon': {
                 color: mode === 'dark' ? '#9ca3af' : '#6b7280',
               },
             },
           },
         },
       },
      MuiSelect: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: mode === 'dark' ? '#4b5563' : '#d1d5db',
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: mode === 'dark' ? '#6b7280' : '#9ca3af',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: '#2984D7',
            },
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
            },
            '&.Mui-selected': {
              backgroundColor: mode === 'dark' ? 'rgba(41, 132, 215, 0.16)' : 'rgba(41, 132, 215, 0.08)',
              '&:hover': {
                backgroundColor: mode === 'dark' ? 'rgba(41, 132, 215, 0.24)' : 'rgba(41, 132, 215, 0.12)',
              },
            },
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
            },
            '&.Mui-selected': {
              backgroundColor: mode === 'dark' ? 'rgba(41, 132, 215, 0.16)' : 'rgba(41, 132, 215, 0.08)',
              '&:hover': {
                backgroundColor: mode === 'dark' ? 'rgba(41, 132, 215, 0.24)' : 'rgba(41, 132, 215, 0.12)',
              },
            },
          },
        },
      },
      // Tooltip styling for better dark mode visibility
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: mode === 'dark' ? '#374151' : '#1f2937', // Dark background for both modes
            color: mode === 'dark' ? '#f9fafb' : '#f9fafb', // Light text for both modes
            fontSize: '0.75rem',
            fontWeight: 500,
            padding: '8px 12px',
            borderRadius: 6,
            boxShadow: mode === 'dark' 
              ? '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)'
              : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            border: mode === 'dark' ? '1px solid #4b5563' : '1px solid #374151',
          },
          arrow: {
            color: mode === 'dark' ? '#374151' : '#1f2937',
            '&:before': {
              border: mode === 'dark' ? '1px solid #4b5563' : '1px solid #374151',
            },
          },
        },
      },
      // Ensure consistent scroll bar styling across all MUI components
      MuiCssBaseline: {
        styleOverrides: {
          '*': {
            // WebKit browsers (Chrome, Safari, Edge)
            '&::-webkit-scrollbar': {
              width: '6px',
              height: '6px',
            },
            '&::-webkit-scrollbar-track': {
              background: 'transparent',
              borderRadius: '4px',
            },
            '&::-webkit-scrollbar-thumb': {
              background: mode === 'dark' ? '#4b5563' : '#d1d5db',
              borderRadius: '4px',
              border: '1px solid transparent',
              backgroundClip: 'padding-box',
            },
            '&::-webkit-scrollbar-thumb:hover': {
              background: mode === 'dark' ? '#6b7280' : '#9ca3af',
            },
            '&::-webkit-scrollbar-thumb:active': {
              background: mode === 'dark' ? '#9ca3af' : '#6b7280',
            },
            '&::-webkit-scrollbar-corner': {
              background: 'transparent',
            },
            // Firefox scrollbar styling
            scrollbarWidth: 'thin',
            scrollbarColor: mode === 'dark' ? '#4b5563 transparent' : '#d1d5db transparent',
          },
        },
      },
    },
  });

  // Augment the theme with custom icon colors
  theme.palette.icon = {
    favorite: '#eab308', // yellow-500 (gold/yellow for favorites)
    history: 'inherit', // reverted - no specific color
    query: 'inherit', // reverted - no specific color
    connection: 'inherit', // reverted - no specific color
    settings: '#6b7280', // gray-500 (neutral for settings)
    copy: '#6b7280', // gray-500 (neutral for copy action)
    execute: '#22c55e', // green-500 (green for execute - keeping this one green)
    delete: '#ef4444', // red-500 (red for delete)
    edit: '#f59e0b', // amber-500 (warm amber/orange for edit/pencil)
    database: 'inherit', // reverted - no specific color
    collection: 'inherit', // reverted - no specific color
    export: '#0891b2', // cyan-600 (cyan for export instead of green)
    import: '#2563eb', // blue-600 (dark blue for import)
    spreadsheet: 'inherit', // reverted - no specific color
  };

  // Augment the theme with syntax highlighting colors for JSON data types
  // These colors are used consistently across all JSON viewers/editors
  theme.palette.syntax = {
    null: {
      color: theme.palette.text.disabled,
      fontStyle: 'italic',
      fontWeight: 'normal'
    },
    boolean: {
      color: theme.palette.warning.main,
      fontStyle: 'normal',
      fontWeight: 500
    },
    number: {
      color: theme.palette.info.main,
      fontStyle: 'normal',
      fontWeight: 500
    },
    string: {
      color: theme.palette.success.main,
      fontStyle: 'normal',
      fontWeight: 'normal'
    },
    objectId: {
      color: theme.palette.primary.main,
      fontStyle: 'normal',
      fontWeight: 600
    },
    date: {
      color: theme.palette.secondary.main,
      fontStyle: 'normal',
      fontWeight: 600
    },
    key: {
      color: theme.palette.text.primary,
      fontStyle: 'normal',
      fontWeight: 'normal'
    },
    // Convenience accessors for common use cases
    getColor: function(type) {
      return this[type]?.color || theme.palette.text.primary;
    },
    getStyle: function(type) {
      const typeStyle = this[type];
      if (!typeStyle) return {};
      return {
        color: typeStyle.color,
        fontStyle: typeStyle.fontStyle,
        fontWeight: typeStyle.fontWeight
      };
    }
  };

  // Cache the theme before returning
  themeCache.set(mode, theme);
  return theme;
};