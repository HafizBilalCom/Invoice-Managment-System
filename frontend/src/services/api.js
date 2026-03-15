import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
const publicBaseURL = baseURL.replace(/\/api\/?$/, '');

const api = axios.create({
  baseURL,
  withCredentials: true
});

export const authApi = {
  me: async () => {
    const { data } = await api.get('/auth/me');
    return data.user;
  },
  logout: async () => {
    await api.post('/auth/logout');
  },
  impersonate: async (userId) => {
    const { data } = await api.post(`/auth/impersonate/${userId}`);
    return data.user;
  },
  stopImpersonation: async () => {
    const { data } = await api.post('/auth/impersonate/stop');
    return data.user;
  },
  disconnectJira: async () => {
    await api.post('/auth/jira/disconnect');
  },
  googleAuthUrl: `${baseURL}/auth/google`,
  jiraConnectUrl: `${baseURL}/auth/jira/connect`
};

export const timelogApi = {
  list: async (params = {}) => {
    const { data } = await api.get('/timelogs', { params });
    return data.timelogs;
  },
  getSyncStatus: async () => {
    const { data } = await api.get('/timelogs/sync/status');
    return data;
  },
  sync: async (payload) => {
    const { data } = await api.post('/timelogs/sync', payload);
    return data;
  }
};

export const projectsApi = {
  list: async () => {
    const { data } = await api.get('/projects');
    return data.projects;
  },
  issues: async (projectId) => {
    const { data } = await api.get(`/projects/${projectId}/issues`);
    return data;
  },
  syncProjects: async () => {
    const { data } = await api.post('/projects/sync');
    return data;
  },
  syncAllIssues: async () => {
    const { data } = await api.post('/projects/sync-issues-all');
    return data;
  },
  getSyncAllIssuesStatus: async () => {
    const { data } = await api.get('/projects/sync-issues-all/status');
    return data;
  },
  syncIssues: async (projectId) => {
    const { data } = await api.post(`/projects/${projectId}/sync-issues`);
    return data;
  }
};

export const tempoAccountsApi = {
  list: async () => {
    const { data } = await api.get('/tempo/accounts');
    return data.accounts;
  },
  sync: async () => {
    const { data } = await api.post('/tempo/accounts/sync');
    return data;
  }
};

export const jiraUsersApi = {
  list: async () => {
    const { data } = await api.get('/jira-users');
    return data.users;
  },
  sync: async () => {
    const { data } = await api.post('/jira-users/sync');
    return data;
  }
};

export const invoiceApi = {
  list: async (params = {}) => {
    const { data } = await api.get('/invoices', { params });
    return data.invoices;
  },
  get: async (id) => {
    const { data } = await api.get(`/invoices/${id}`);
    return data.invoice;
  },
  syncCreate: async (payload) => {
    const { data } = await api.post('/invoices/sync-create', payload);
    return data.invoice;
  },
  listApprovers: async () => {
    const { data } = await api.get('/invoices/approvers');
    return data.approvers;
  },
  submit: async (id, payload) => {
    const { data } = await api.post(`/invoices/${id}/submit`, payload);
    return data.invoice;
  },
  regeneratePdf: async (id) => {
    const { data } = await api.post(`/invoices/${id}/regenerate-pdf`);
    return data.invoice;
  },
  updateStatus: async (id, payload) => {
    const { data } = await api.patch(`/invoices/${id}/status`, payload);
    return data.invoice;
  },
  addComment: async (id, payload) => {
    const { data } = await api.post(`/invoices/${id}/comment`, payload);
    return data.invoice;
  },
  pdfUrl: (pdfPath) => {
    if (!pdfPath) {
      return '';
    }

    return `${publicBaseURL}/${String(pdfPath).replace(/^\/+/, '')}`;
  }
};

export const profileApi = {
  get: async () => {
    const { data } = await api.get('/profile');
    return data;
  },
  update: async (payload) => {
    const { data } = await api.put('/profile', payload);
    return data;
  },
  listManagerCandidates: async () => {
    const { data } = await api.get('/profile/manager-candidates');
    return data.users;
  },
  setManagerCandidate: async (userId, payload) => {
    const { data } = await api.put(`/profile/manager-candidates/${userId}`, payload);
    return data;
  }
};

export const workflowApi = {
  listSteps: async () => {
    const { data } = await api.get('/workflow/steps');
    return data.steps;
  },
  updateSteps: async (steps) => {
    const { data } = await api.put('/workflow/steps', { steps });
    return data.steps;
  }
};

export const syncLogsApi = {
  list: async (params = {}) => {
    const { data } = await api.get('/sync-logs', { params });
    return data;
  }
};

export default api;
