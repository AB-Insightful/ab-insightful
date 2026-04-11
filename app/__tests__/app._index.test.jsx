import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { useLoaderData, useFetcher } from 'react-router';
import Index from '../routes/app._index'; 

vi.mock('recharts', () => ({
  LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>,
}));

vi.mock('../components/DateRangePicker', () => ({
  default: () => <div>DateRangePicker</div>,
}));

// Mock the specific hooks
vi.mock('react-router', () => ({
  useLoaderData: vi.fn(),
  useFetcher: vi.fn(),
}));

// Mock App Bridge so toast/UI components don't crash
vi.mock('@shopify/app-bridge-react', () => ({
  useAppBridge: () => ({
    toast: { show: vi.fn() }
  }),
}));

// Mock the DateRangeContext so it doesn't crash
vi.mock('../contexts/DateRangeContext', () => ({
  useDateRange: () => ({ dateRange: { start: '2026-01-01', end: '2026-01-31' } }),
  formatDateForDisplay: (d) => d,
}));

describe('Index Component - Happy Path', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default fetcher state so the "Happy Path" doesn't break
    useFetcher.mockReturnValue({ state: 'idle', data: null, submit: vi.fn() });
  });

  it('renders correctly with experiment data', () => {
    useLoaderData.mockReturnValue({
      experiment: { 
        name: "Main A/B Test", 
        variants: [{ name: "Original" }, { name: "Red Button" }], 
        status: "Active",
        createdAt: "2026-01-01T12:00:00Z", 
        analyses: [
          {
            calculatedWhen: new Date("2026-01-05"), 
            variant: { name: "Original" },
            probabilityOfBeingBest: 0.45,
            expectedLoss: 0.01
          }
        ],
        experimentGoal: "Purchase"
      },
      tableData: [
        { 
          variantName: "Original", 
          totalConversions: 50, 
          totalUsers: 1000, 
          improvement: 0, 
          probabilityOfBeingBest: 0.45 
        }
      ],
      tutorialData: { allSetupDone: true }
    });

    render(<Index />);

    // Validate the Name and Status render
    expect(screen.getByText('Main A/B Test')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();

    // Verify Formatter Integration
    expect(screen.getByText('50/1000')).toBeInTheDocument(); 
    expect(screen.getByText('45.0%')).toBeInTheDocument(); 
  });

  it('shows a no-data indicator instead of a graph when no chartable analysis data exists', async () => {
    useLoaderData.mockReturnValue({
      experiment: {
        name: 'Main A/B Test',
        variants: [{ id: 1, name: 'Original' }],
        status: 'Active',
        createdAt: '2026-01-01T12:00:00Z',
        analyses: [],
        experimentGoal: 'Purchase',
      },
      tableData: [],
      tutorialData: { allSetupDone: true, webPixelStatus: true, onSiteTracking: true },
      shop: 'demo-shop',
    });

    render(<Index />);

    expect(await screen.findByText('No graph data available for the selected date range.')).toBeInTheDocument();
    expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument();
  });

  it('shows a no-data indicator when analyses only contain zero-metric rows', async () => {
    useLoaderData.mockReturnValue({
      experiment: {
        name: 'Main A/B Test',
        variants: [
          { id: 1, name: 'Original' },
          { id: 2, name: 'Variant A' },
        ],
        status: 'Active',
        createdAt: '2026-01-01T12:00:00Z',
        analyses: [
          {
            calculatedWhen: '2026-01-05T00:00:00Z',
            totalConversions: 0,
            totalUsers: 300,
            probabilityOfBeingBest: 0,
            expectedLoss: 0,
            variant: { name: 'Original' },
          },
          {
            calculatedWhen: '2026-01-05T00:00:00Z',
            totalConversions: 12,
            totalUsers: 0,
            probabilityOfBeingBest: 0,
            expectedLoss: 0,
            variant: { name: 'Variant A' },
          },
        ],
        experimentGoal: 'Purchase',
      },
      tableData: [],
      tutorialData: { allSetupDone: true, webPixelStatus: true, onSiteTracking: true },
      shop: 'demo-shop',
    });

    render(<Index />);

    expect(await screen.findByText('No graph data available for the selected date range.')).toBeInTheDocument();
    expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument();
  });

  describe('Index Component - Setup Tutorial Actions', () => {
    it('calls fetcher.submit when Enable Tracking is clicked', () => {
      const mockSubmit = vi.fn();
      useFetcher.mockReturnValue({
        state: 'idle',
        data: null,
        submit: mockSubmit,
      });
  
      useLoaderData.mockReturnValue({
        experiment: { variants: [] }, 
        tableData: [],
        tutorialData: { webPixelStatus: false, onSiteTracking: false }
      });
  
      render(<Index />);
      
      const enableButton = screen.getByRole('button', { name: /Enable Tracking/i });
      fireEvent.click(enableButton);
  
      expect(mockSubmit).toHaveBeenCalledWith(
        { action: "enableTracking" },
        { method: "POST" }
      );
    });
  
    it('shows "Enabling..." text when the fetcher is submitting', () => {
      useFetcher.mockReturnValue({
        state: 'submitting',
        formData: new FormData(), // Mocking the submission context
        submit: vi.fn(),
      });
      // Set formData action so the button knows it is the one being submitted
      useFetcher.mockReturnValue({
        state: 'submitting',
        formData: { get: (key) => (key === "action" ? "enableTracking" : null) },
        submit: vi.fn()
      });
  
      useLoaderData.mockReturnValue({
        experiment: {variants: []},
        tableData: [],
        tutorialData: { webPixelStatus: false, onSiteTracking: false }
      });
  
      render(<Index />);
      expect(screen.getByText('Enabling...')).toBeInTheDocument();
    });
  });
});