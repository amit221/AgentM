import React, { memo, useMemo } from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { SmartToy } from '@mui/icons-material';
import { 
  shouldRenderAsResult, 
  shouldRenderAsQuery, 
  shouldAnimateMessage, 
  shouldShowLoadingIndicator,
  sortMessagesByTimestamp 
} from '../../utils/displayHelpers';
import LoadingDots from './LoadingDots';
import ChatMessage from './ChatMessage';
import QueryDisplay from './QueryDisplay';
import QueryResultDisplay from '../results/QueryResultDisplay';

/**
 * Helper function to determine if a message should be kept in the filtered list
 */
function shouldKeepMessage(message, index, messages) {
  if (!message) return false;
  
  // Always keep non-result and non-query messages
  if (!message.isResult && !message.isQuery) return true;
  
  // For result messages, only keep the last one
  if (message.isResult) {
    const lastResultIndex = messages.map(msg => msg?.isResult).lastIndexOf(true);
    return index === lastResultIndex;
  }
  
  // For query messages, keep all of them (they're part of conversation history)
  // Only filter out exact duplicates that appear consecutively
  if (message.isQuery) {
    // Check if this is a consecutive duplicate
    if (index > 0) {
      const previousMessage = messages[index - 1];
      if (previousMessage?.isQuery && 
          previousMessage?.queryData === message.queryData &&
          previousMessage?.id !== message.id) {
        // This is a consecutive duplicate, filter it out
        return false;
      }
    }
    // Keep all other query messages (they're part of the conversation history)
    return true;
  }
  
  return true;
}

/**
 * Helper function to filter messages for display
 */
function filterMessagesForDisplay(messages) {
  if (!Array.isArray(messages)) return [];
  
  const sortedMessages = sortMessagesByTimestamp(messages);
  const filteredMessages = sortedMessages.filter((msg, index) => shouldKeepMessage(msg, index, sortedMessages));
  
  // Debug logging to help identify filtering issues
  const queryMessages = sortedMessages.filter(msg => msg?.isQuery);
  const filteredQueryMessages = filteredMessages.filter(msg => msg?.isQuery);
  
  if (queryMessages.length > 0 && filteredQueryMessages.length === 0) {
    console.warn('🚨 All query messages were filtered out!', {
      totalMessages: sortedMessages.length,
      queryMessages: queryMessages.length,
      filteredQueryMessages: filteredQueryMessages.length,
      queryMessageIds: queryMessages.map(m => m.id),
      allMessageTypes: sortedMessages.map(m => ({ id: m.id, isQuery: m.isQuery, isResult: m.isResult, isUser: m.isUser }))
    });
  }
  
  return filteredMessages;
}

/**
 * Chat content area that renders all messages and loading states
 */
const ChatContent = memo(({
  messages,
  isLoading,
  queryOperations,
  messagesEndRef,
  conversationId
}) => {
  // Track prop references to debug why memo isn't working - declare BEFORE using
  const messagesRef = React.useRef();
  const queryOpRef = React.useRef();


  
  // Update refs after logging
  messagesRef.current = messages;
  queryOpRef.current = queryOperations;

  // Memoize filtered messages to prevent unnecessary recalculations
  const filteredMessages = useMemo(() => {
    const filtered = filterMessagesForDisplay(messages);
    return filtered;
  }, [messages]);

  // Memoize rendered messages to prevent unnecessary re-renders
  const renderedMessages = useMemo(() => {
    
    return filteredMessages.map((message) => {
      if (shouldRenderAsResult(message)) {
        return (
          <QueryResultDisplay 
            key={message.id} 
            result={message.resultData} 
            messageLevel={message.level}
            animate={shouldAnimateMessage(message)}
            onRunQuery={queryOperations.handleRunQuery}
            onEditQuery={queryOperations.handleEditQuery}
            onComplete={message.onComplete}
            conversationId={conversationId}
          />
        );
      }
      if (shouldRenderAsQuery(message)) {
        return (
          <QueryDisplay 
            key={message.id} 
            query={message.queryData} 
            animate={shouldAnimateMessage(message)}
            isFixedQuery={message.isFixedQuery}
            onRunQuery={() => queryOperations.handleRunQuery(message.queryData)}
            onEditQuery={() => queryOperations.handleEditQuery(message.queryData)}
            onComplete={message.onComplete}
          />
        );
      }
      return (
        <ChatMessage 
          key={message.id} 
          message={message} 
          isUser={message.isUser}
          animate={shouldAnimateMessage(message)}
          showTypewriter={message.showTypewriter}
          onComplete={message.onComplete}
          onDangerousQueryConfirm={queryOperations.handleDangerousQueryConfirm}
          onDangerousQueryCancel={queryOperations.handleDangerousQueryCancel}
          onUseSafeQueryVersion={queryOperations.handleUseSafeQueryVersion}
        />
      );
    });
  }, [filteredMessages, queryOperations]);

  return (
    <Box sx={{
      flex: 1,
      overflow: 'auto',
      pt: '8px',
      pb: 2,
      bgcolor: 'background.default',
      minHeight: 0
    }}>
      {renderedMessages}
      
      {/* Loading dots indicator */}
      {isLoading && <LoadingDots />}
      
      <div ref={messagesEndRef} />
    </Box>
  );
});

ChatContent.displayName = 'ChatContent';

export default ChatContent;
