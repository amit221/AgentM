import {
  Button as MUIButton,
  TextField as MUITextField,
  Card as MUICard,
  Chip,
  Box,
} from '@mui/material';
import { styled } from '@mui/material/styles';

// Custom Button components to match the original btn classes
export const Button = styled(MUIButton)(({ theme, variant = 'contained', color = 'primary' }) => ({
  textTransform: 'none',
  fontWeight: 500,
  borderRadius: 6,
  padding: '8px 16px',
  '&:focus': {
    outline: 'none',
    boxShadow: `0 0 0 2px ${theme.palette.primary.main}33`,
  },
}));

export const SecondaryButton = styled(MUIButton)(({ theme }) => ({
  textTransform: 'none',
  fontWeight: 500,
  borderRadius: 6,
  padding: '8px 16px',
  backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[700] : theme.palette.grey[200],
  color: theme.palette.mode === 'dark' ? theme.palette.grey[100] : theme.palette.grey[900],
  '&:hover': {
    backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[600] : theme.palette.grey[300],
  },
  '&:focus': {
    outline: 'none',
    boxShadow: `0 0 0 2px ${theme.palette.grey[500]}33`,
  },
}));

export const WarningButton = styled(MUIButton)(({ theme }) => ({
  textTransform: 'none',
  fontWeight: 500,
  borderRadius: 6,
  padding: '8px 16px',
  backgroundColor: theme.palette.warning.main,
  color: theme.palette.warning.contrastText,
  '&:hover': {
    backgroundColor: theme.palette.warning.dark,
  },
  '&:focus': {
    outline: 'none',
    boxShadow: `0 0 0 2px ${theme.palette.warning.main}33`,
  },
}));

export const GhostButton = styled(MUIButton)(({ theme }) => ({
  textTransform: 'none',
  fontWeight: 500,
  borderRadius: 6,
  padding: '8px 16px',
  backgroundColor: 'transparent',
  color: theme.palette.mode === 'dark' ? theme.palette.grey[400] : theme.palette.grey[600],
  border: `1px solid ${theme.palette.mode === 'dark' ? theme.palette.grey[600] : theme.palette.grey[300]}`,
  '&:hover': {
    backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[700] : theme.palette.grey[100],
  },
  '&:focus': {
    outline: 'none',
    boxShadow: `0 0 0 2px ${theme.palette.grey[500]}33`,
  },
}));

// Custom TextField to match the input class
export const TextField = styled(MUITextField)(({ theme }) => ({
  '& .MuiOutlinedInput-root': {
    borderRadius: 6,
    backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[700] : theme.palette.background.paper,
    '& fieldset': {
      borderColor: theme.palette.mode === 'dark' ? theme.palette.grey[600] : theme.palette.grey[300],
    },
    '&:hover fieldset': {
      borderColor: theme.palette.mode === 'dark' ? theme.palette.grey[500] : theme.palette.grey[400],
    },
    '&.Mui-focused fieldset': {
      borderColor: theme.palette.primary.main,
      borderWidth: 1,
    },
  },
  '& .MuiInputLabel-root': {
    color: theme.palette.mode === 'dark' ? theme.palette.grey[300] : theme.palette.grey[700],
    fontWeight: 500,
  },
  '& .MuiOutlinedInput-input': {
    color: theme.palette.mode === 'dark' ? theme.palette.grey[100] : theme.palette.grey[900],
    '&::placeholder': {
      color: theme.palette.mode === 'dark' ? theme.palette.grey[400] : theme.palette.grey[400],
      opacity: 1,
    },
  },
}));

// Custom Card to match the card class
export const Card = styled(MUICard)(({ theme }) => ({
  borderRadius: 8,
  border: `1px solid ${theme.palette.mode === 'dark' ? theme.palette.grey[700] : theme.palette.grey[200]}`,
  boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.background.paper,
}));

// Example prompt chip component (replaces the gray pill buttons)
export const ExampleChip = styled(Chip)(({ theme }) => ({
  borderRadius: 6,
  backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[700] : theme.palette.grey[100],
  color: theme.palette.mode === 'dark' ? theme.palette.grey[300] : theme.palette.grey[700],
  '&:hover': {
    backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[600] : theme.palette.grey[200],
  },
  '& .MuiChip-label': {
    fontSize: '0.875rem',
    padding: '4px 8px',
  },
}));

// Layout containers
export const FlexBox = styled(Box)({
  display: 'flex',
});

export const FlexColumn = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
});

export const FlexRow = styled(Box)({
  display: 'flex',
  flexDirection: 'row',
});

// Spacing utilities
export const Spacer = styled(Box)(({ size = 1 }) => ({
  margin: `${size * 8}px`,
}));

export const HorizontalSpacer = styled(Box)(({ size = 1 }) => ({
  marginLeft: `${size * 8}px`,
  marginRight: `${size * 8}px`,
}));

export const VerticalSpacer = styled(Box)(({ size = 1 }) => ({
  marginTop: `${size * 8}px`,
  marginBottom: `${size * 8}px`,
}));