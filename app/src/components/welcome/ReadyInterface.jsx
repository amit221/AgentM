import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { shouldShowWithOpacity, getTransitionDelay } from '../../utils/displayHelpers';
import ChatInputSection from '../chat/ChatInputSection';
import { useDatabase } from '../../context/DatabaseContext';
import { isRelationalDatabase } from '../../utils/databaseTypeUtils';

/**
 * Main ready interface when user is connected and ready to interact
 */
const ReadyInterface = ({
  isAnimationComplete,
  onSend,
  isLoading,
  inputValue,
  onInputChange,
  mode,
  onModeChange,
  onStop
}) => {
  const { activeConnections, getConnectionDatabaseType } = useDatabase();
  
  // Get the current database type from active connection
  const currentDbType = useMemo(() => {
    const connId = activeConnections?.[0];
    if (!connId) return 'mongodb';
    return getConnectionDatabaseType(connId);
  }, [activeConnections, getConnectionDatabaseType]);
  
  const isSqlDatabase = isRelationalDatabase(currentDbType);
  
  // Generate appropriate description based on database type
  const queryDescription = isSqlDatabase
    ? 'Describe what you want to find in plain English, or write an SQL query directly'
    : 'Describe what you want to find in plain English, or write a MongoDB query directly';
  
  return (
    <Box sx={{ 
      opacity: shouldShowWithOpacity(isAnimationComplete) ? 1 : 0,
      transition: 'opacity 0.3s ease-in',
      transitionDelay: getTransitionDelay(isAnimationComplete)
    }}>
      <Typography variant="h4" sx={{ mb: 1, fontWeight: 300 }}>
        Ask me anything about your data
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        {queryDescription}
      </Typography>
      <ChatInputSection
        onSend={onSend}
        isCentered={true}
        isLoading={isLoading}
        inputValue={inputValue}
        onInputChange={onInputChange}
        mode={mode}
        onModeChange={onModeChange}
        onStop={onStop}
      />
    </Box>
  );
};

export default ReadyInterface;
