import React, { memo } from 'react';
import { Box } from '@mui/material';
import ChatContent from './ChatContent';
import ChatInputSection from './ChatInputSection';

/**
 * Main chat container that combines chat content and input section
 */
const ChatContainer = memo(({
  // Chat content props
  messages,
  isLoading,
  queryOperations,
  messagesEndRef,
  conversationId,
  
  // Input section props
  onSend,
  inputValue,
  onInputChange,
  mode,
  onModeChange,
  onStop,
  schemaGenStatus
}) => {
  // Track prop references to debug why memo isn't working - declare BEFORE using
  const messagesRef = React.useRef();
  const onSendRef = React.useRef();
  const queryOpRef = React.useRef();


  
  // Update refs after logging
  messagesRef.current = messages;
  onSendRef.current = onSend;
  queryOpRef.current = queryOperations;
  return (
    <>
      {/* Chat Messages */}
      <ChatContent
        messages={messages}
        isLoading={isLoading}
        queryOperations={queryOperations}
        messagesEndRef={messagesEndRef}
        conversationId={conversationId}
      />
      
      {/* Bottom Input */}
      <Box sx={{ 
        borderTop: 1, 
        borderColor: 'divider',
        bgcolor: 'background.paper'
      }}>
        <ChatInputSection
          onSend={onSend}
          isCentered={false}
          isLoading={isLoading}
          inputValue={inputValue}
          onInputChange={onInputChange}
          mode={mode}
          onModeChange={onModeChange}
          onStop={onStop}
          schemaGenStatus={schemaGenStatus}
        />
      </Box>
    </>
  );
});

ChatContainer.displayName = 'ChatContainer';

export default ChatContainer;
