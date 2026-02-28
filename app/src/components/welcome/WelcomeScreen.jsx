import { Box } from '@mui/material';
import { shouldShowReadyInterface, shouldShowDatabaseSelection, shouldShowConnectionSetup } from '../../utils/displayHelpers';
import ReadyInterface from './ReadyInterface';
import DatabaseSelectionScreen from './DatabaseSelectionScreen';
import ConnectionSetupScreen from './ConnectionSetupScreen';

/**
 * Main welcome screen component that renders different states based on connection status
 */
const WelcomeScreen = ({
  isConnected,
  hasSelectedDatabase,
  isFullyReady,
  isAnimationComplete,
  onSend,
  isLoading,
  inputValue,
  onInputChange,
  mode,
  onModeChange,
  onStop
}) => {
  return (
    <Box sx={{ 
      flex: 1, 
      display: 'flex', 
      flexDirection: 'column',
      p: 3
    }}>
      {/* Centered Content */}
      <Box sx={{ 
        flex: 1, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center'
      }}>
        <Box sx={{ textAlign: 'center', maxWidth: '600px', width: '100%' }}>
          {shouldShowReadyInterface(isFullyReady) && (
            <ReadyInterface
              isAnimationComplete={isAnimationComplete}
              onSend={onSend}
              isLoading={isLoading}
              inputValue={inputValue}
              onInputChange={onInputChange}
              mode={mode}
              onModeChange={onModeChange}
              onStop={onStop}
            />
          )}
          
          {shouldShowDatabaseSelection(isConnected, hasSelectedDatabase) && (
            <DatabaseSelectionScreen />
          )}
          
          {shouldShowConnectionSetup(isConnected, hasSelectedDatabase) && (
            <ConnectionSetupScreen />
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default WelcomeScreen;
