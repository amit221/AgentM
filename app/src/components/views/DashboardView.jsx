import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardActions,
  Grid,
  IconButton,
  Menu,
  MenuItem,
  Alert,
  CircularProgress,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Add as AddIcon,
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon
} from '@mui/icons-material';
import { 
  getAllDashboards, 
  saveDashboard, 
  deleteDashboard,
  createDefaultDashboard,
  getDashboardSettings,
  saveDashboardSettings,
  cleanupDashboardSettings
} from '../../services/dashboardStorageService';
import Dashboard from '../dashboard/Dashboard';
import EditDashboardDialog from '../dashboard/EditDashboardDialog';

/**
 * Main dashboard management view
 */
const DashboardView = () => {
  const [dashboards, setDashboards] = useState([]);
  const [selectedDashboard, setSelectedDashboard] = useState(null);
  
  // Debug logging for selectedDashboard changes
  useEffect(() => {
    
  }, [selectedDashboard]);

  // Safe dashboard selection that validates the ID exists
  const safeSetSelectedDashboard = (dashboardId, skipValidation = false) => {
    
    
    if (!dashboardId) {
      setSelectedDashboard(null);
      return;
    }
    
    // Skip validation for newly created dashboards
    if (skipValidation) {
      
      setSelectedDashboard(dashboardId);
      return;
    }
    
    const exists = dashboards.some(d => d.id === dashboardId);
    if (exists) {
      
      setSelectedDashboard(dashboardId);
    } else {
      console.warn('Dashboard does not exist, ignoring selection:', dashboardId);
      
    }
  };
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [selectedDashboardForMenu, setSelectedDashboardForMenu] = useState(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState('');
  const [newDashboardDescription, setNewDashboardDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingDashboard, setEditingDashboard] = useState(null);

  useEffect(() => {
    initializeDashboards();
  }, []);

  const initializeDashboards = async () => {
    
    
    try {
      // First cleanup any corrupted settings
      
      const cleanupResult = await cleanupDashboardSettings();
      
      
      // Then load dashboards and default
      
      await loadDashboards();
      
      
      await loadDefaultDashboard();
      
      
    } catch (error) {
      console.error('=== DASHBOARD INITIALIZATION FAILED ===', error);
    }
  };

  const loadDashboards = async () => {
    
    setIsLoading(true);
    setError(null);
    
    try {
      
      const result = await getAllDashboards();
      
      
      if (result.success) {
        
        setDashboards(result.dashboards);
        
        // If no dashboards exist, create a default one
        if (result.dashboards.length === 0) {
          
          await createFirstDashboard();
        }
      } else {
        console.error('loadDashboards: Failed to load dashboards:', result.error);
        setError(result.error);
      }
    } catch (err) {
      console.error('loadDashboards: Exception:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDefaultDashboard = async () => {
    
    
    try {
      
      const settingsResult = await getDashboardSettings();
      
      
      if (settingsResult.success && settingsResult.settings.defaultDashboardId) {
        
        
        const dashboardsResult = await getAllDashboards();
        
        
        if (dashboardsResult.success) {
          const defaultDashboard = dashboardsResult.dashboards.find(
            d => d.id === settingsResult.settings.defaultDashboardId
          );
          
          
          if (defaultDashboard) {
            
            safeSetSelectedDashboard(defaultDashboard.id);
          } else {
            // Default dashboard doesn't exist, clear the setting and select first available
            console.warn('loadDefaultDashboard: Default dashboard not found, clearing setting');
            await saveDashboardSettings({ defaultDashboardId: null });
            if (dashboardsResult.dashboards.length > 0) {
              
              safeSetSelectedDashboard(dashboardsResult.dashboards[0].id);
            }
          }
        }
      } else {
        
        // No default dashboard set, select first available
        const dashboardsResult = await getAllDashboards();
        if (dashboardsResult.success && dashboardsResult.dashboards.length > 0) {
          
          safeSetSelectedDashboard(dashboardsResult.dashboards[0].id);
        }
      }
    } catch (err) {
      console.error('loadDefaultDashboard: Failed to load default dashboard:', err);
    }
  };

  const createFirstDashboard = async () => {
    try {
      
      const result = await createDefaultDashboard();
      if (result.success) {
        
        
        // Update local state
        setDashboards([result.dashboard]);
        
        // Now select the dashboard (no reload needed, we just created it)
        
        safeSetSelectedDashboard(result.dashboard.id, true);
        
        // Set as default dashboard
        await saveDashboardSettings({
          defaultDashboardId: result.dashboard.id
        });
      }
    } catch (err) {
      console.error('Failed to create default dashboard:', err);
    }
  };

  const handleCreateDashboard = async () => {
    if (!newDashboardName.trim()) return;

    setIsCreating(true);
    try {
      const dashboard = {
        name: newDashboardName.trim(),
        description: newDashboardDescription.trim(),
        layout: { lg: [], md: [], sm: [], xs: [] },
        widgets: {}
      };

      const result = await saveDashboard(dashboard);
      if (result.success) {
        
        
        // Update local state
        setDashboards(prev => [...prev, result.dashboard]);
        
        // Close dialog first
        setShowCreateDialog(false);
        setNewDashboardName('');
        setNewDashboardDescription('');
        
        // Now select the dashboard (no reload needed, we just created it)
        
        safeSetSelectedDashboard(result.dashboard.id, true);
      }
    } catch (err) {
      console.error('Failed to create dashboard:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteDashboard = async (dashboardId) => {
    try {
      const result = await deleteDashboard(dashboardId);
      if (result.success) {
        setDashboards(prev => prev.filter(d => d.id !== dashboardId));
        
        // If we deleted the selected dashboard, select another one
        if (selectedDashboard === dashboardId) {
          const remaining = dashboards.filter(d => d.id !== dashboardId);
          setSelectedDashboard(remaining.length > 0 ? remaining[0].id : null);
        }
      }
    } catch (err) {
      console.error('Failed to delete dashboard:', err);
    }
    handleMenuClose();
  };

  const handleMenuOpen = (event, dashboard) => {
    setMenuAnchor(event.currentTarget);
    setSelectedDashboardForMenu(dashboard);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setSelectedDashboardForMenu(null);
  };

  // Debug function to reset dashboard settings
  const handleResetDashboardSettings = async () => {
    try {
      
      
      // Clear selected dashboard
      setSelectedDashboard(null);
      
      // Clear all dashboard settings
      await saveDashboardSettings({ defaultDashboardId: null });
      
      // Reload everything
      await initializeDashboards();
      
      
    } catch (err) {
      console.error('Failed to reset dashboard settings:', err);
    }
  };

  // Function to completely reset dashboard state
  const handleCompleteReset = async () => {
    try {
      
      
      // Clear all state
      setSelectedDashboard(null);
      setDashboards([]);
      setError(null);
      
      // Clear storage
      await saveDashboardSettings({ defaultDashboardId: null });
      
      // Force reload
      window.location.reload();
      
    } catch (err) {
      console.error('Failed to complete reset:', err);
    }
  };

  const handleSetAsDefault = async (dashboardId) => {
    try {
      await saveDashboardSettings({
        defaultDashboardId: dashboardId
      });
    } catch (err) {
      console.error('Failed to set default dashboard:', err);
    }
    handleMenuClose();
  };

  const handleEditDashboard = () => {
    if (selectedDashboardForMenu) {
      setEditingDashboard(selectedDashboardForMenu);
      setShowEditDialog(true);
    }
    handleMenuClose();
  };

  const handleSaveEditedDashboard = async (updatedDashboard) => {
    try {
      const result = await saveDashboard(updatedDashboard);
      if (result.success) {
        // Update the dashboards list with the new data
        setDashboards(prev => 
          prev.map(d => d.id === updatedDashboard.id ? result.dashboard : d)
        );
        
        
      } else {
        console.error('Failed to update dashboard:', result.error);
      }
    } catch (err) {
      console.error('Failed to save dashboard changes:', err);
    }
  };

  const handleCloseEditDialog = () => {
    setShowEditDialog(false);
    setEditingDashboard(null);
  };

  // Render loading state
  if (isLoading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '400px'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <CircularProgress />
          <Typography variant="body2">
            Loading dashboards...
          </Typography>
        </Box>
      </Box>
    );
  }

  // Render error state
  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Failed to load dashboards: {error}
      </Alert>
    );
  }

  // Render dashboard view if one is selected AND exists
  if (selectedDashboard) {
    // Verify the selected dashboard actually exists
    const dashboardExists = dashboards.some(d => d.id === selectedDashboard);
    
    if (!dashboardExists) {
      console.warn('Selected dashboard does not exist:', selectedDashboard);
      
      
      // Clear the invalid selection
      setSelectedDashboard(null);
      
      // Show error message
      return (
        <Alert severity="warning" sx={{ m: 2 }}>
          The selected dashboard no longer exists. Please select a different dashboard.
          <Button 
            variant="outlined" 
            size="small" 
            onClick={() => window.location.reload()}
            sx={{ ml: 2 }}
          >
            Refresh Page
          </Button>
        </Alert>
      );
    }
    
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Dashboard Header with Navigation */}
        <Box sx={{ 
          p: 1, 
          borderBottom: '1px solid', 
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 2
        }}>
          <Button
            variant="outlined"
            onClick={() => setSelectedDashboard(null)}
            size="small"
          >
            ← All Dashboards
          </Button>
          
          <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 500 }}>
            {dashboards.find(d => d.id === selectedDashboard)?.name || 'Dashboard'}
          </Typography>
          
          <Button
            variant="outlined"
            size="small"
            startIcon={<EditIcon />}
            onClick={() => {
              const currentDashboard = dashboards.find(d => d.id === selectedDashboard);
              if (currentDashboard) {
                setEditingDashboard(currentDashboard);
                setShowEditDialog(true);
              }
            }}
          >
            Edit Dashboard
          </Button>
        </Box>

        {/* Dashboard Component - Scrollable Container */}
        <Box sx={{ 
          flex: 1, 
          overflow: 'auto',
          overflowX: 'auto',
          overflowY: 'auto',
          height: 0 // This forces the flex item to respect the parent height
        }}>
          <Dashboard 
            dashboardId={selectedDashboard}
            onDashboardChange={loadDashboards}
          />
        </Box>
      </Box>
    );
  }

  // Render dashboard list
  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        mb: 4 
      }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom>
            Dashboards
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Create and manage your data dashboards
          </Typography>
        </Box>

        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setShowCreateDialog(true)}
        >
          Create Dashboard
        </Button>
      </Box>

      {/* Dashboard Grid */}
      {dashboards.length > 0 ? (
        <Grid container spacing={3}>
          {dashboards.map(dashboard => (
            <Grid item xs={12} sm={6} md={4} key={dashboard.id}>
              <Card 
                sx={{ 
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: 4
                  }
                }}
                onClick={() => safeSetSelectedDashboard(dashboard.id)}
              >
                <CardContent sx={{ flex: 1 }}>
                  <Box sx={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'flex-start',
                    mb: 2
                  }}>
                    <DashboardIcon color="primary" />
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMenuOpen(e, dashboard);
                      }}
                    >
                      <MoreVertIcon />
                    </IconButton>
                  </Box>

                  <Typography variant="h6" component="h3" gutterBottom>
                    {dashboard.name}
                  </Typography>
                  
                  {dashboard.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {dashboard.description}
                    </Typography>
                  )}

                  <Typography variant="caption" color="text.secondary">
                    {Object.keys(dashboard.widgets || {}).length} widgets
                  </Typography>
                </CardContent>

                <CardActions>
                  <Button 
                    size="small" 
                    startIcon={<ViewIcon />}
                    onClick={(e) => {
                      e.stopPropagation();
                      safeSetSelectedDashboard(dashboard.id);
                    }}
                  >
                    View
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        // Empty state
        <Box sx={{ 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center', 
          justifyContent: 'center',
          height: '400px',
          textAlign: 'center'
        }}>
          <DashboardIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No dashboards yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Create your first dashboard to start visualizing your data
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setShowCreateDialog(true)}
          >
            Create Dashboard
          </Button>
        </Box>
      )}

      {/* Dashboard Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => handleSetAsDefault(selectedDashboardForMenu?.id)}>
          Set as Default
        </MenuItem>
        <MenuItem onClick={handleEditDashboard}>
          <EditIcon fontSize="small" sx={{ mr: 1 }} />
          Edit
        </MenuItem>
        <MenuItem 
          onClick={() => handleDeleteDashboard(selectedDashboardForMenu?.id)}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>

      {/* Create Dashboard Dialog */}
      <Dialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Dashboard</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <TextField
              fullWidth
              label="Dashboard Name"
              value={newDashboardName}
              onChange={(e) => setNewDashboardName(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Description (optional)"
              value={newDashboardDescription}
              onChange={(e) => setNewDashboardDescription(e.target.value)}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCreateDialog(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={handleCreateDashboard}
            disabled={!newDashboardName.trim() || isCreating}
          >
            {isCreating ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dashboard Dialog */}
      <EditDashboardDialog
        open={showEditDialog}
        onClose={handleCloseEditDialog}
        dashboard={editingDashboard}
        onSave={handleSaveEditedDashboard}
      />
    </Box>
  );
};

export default DashboardView;
