import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { useLoaderData } from 'react-router';
import Index from '../routes/app._index'; 

// Mock the specific hooks
vi.mock('react-router', () => ({
  useLoaderData: vi.fn(),
  useFetcher: () => ({ state: 'idle', data: null, submit: vi.fn() }),
}));

// Mock the DateRangeContext so it doesn't crash
vi.mock('../contexts/DateRangeContext', () => ({
  useDateRange: () => ({ dateRange: { start: '2026-01-01', end: '2026-01-31' } }),
  formatDateForDisplay: (d) => d,
}));

describe('Index Component - Happy Path', () => {
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
});