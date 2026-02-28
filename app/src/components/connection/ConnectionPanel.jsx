import React from 'react';
import { Box } from '@mui/material';
import ConnectionForm from './ConnectionForm';
import ConnectionStatus from './ConnectionStatus';
import ConnectionHistory from './ConnectionHistory';
import { useDatabase } from '../../context/DatabaseContext';

const ConnectionPanel = () => {
  const {
    connections,
    activeConnections,
    savedConnections,
    isLoading,
    connectionError,
    connect,
    disconnect,
    addSavedConnection,
    removeSavedConnection,
    updateSavedConnection,
    setConnectionError
  } = useDatabase();

  const [currentConnectionString, setCurrentConnectionString] = React.useState('');
  const [selectedConnectionOptions, setSelectedConnectionOptions] = React.useState({});

  const handleConnect = async (connectionName, databaseType = 'mongodb', options = {}) => {
    if (!currentConnectionString.trim()) return;
    const result = await connect(currentConnectionString, { databaseType, ...options }, connectionName);
    // Connection is automatically added to saved connections in the context
  };

  const handleDisconnect = async (connectionId) => {
    await disconnect(connectionId);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Connection Status */}
      <ConnectionStatus />

      {/* Connection Form */}
      <ConnectionForm
        connectionString={currentConnectionString}
        setConnectionString={setCurrentConnectionString}
        onConnect={handleConnect}
        isConnecting={isLoading}
        isConnected={activeConnections.length > 0}
        connectionError={connectionError}
        clearConnectionError={() => setConnectionError(null)}
        initialOptions={selectedConnectionOptions}
      />

      {/* Connection History */}
      <ConnectionHistory
        onSelectConnection={(connectionString, options = {}) => {
          setCurrentConnectionString(connectionString);
          setSelectedConnectionOptions(options);
        }}
        savedConnections={savedConnections}
        onRemoveConnection={removeSavedConnection}
      />
    </Box>
  );
};

export default ConnectionPanel;