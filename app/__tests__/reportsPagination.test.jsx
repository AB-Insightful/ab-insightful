import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useLoaderData } from 'react-router';
import Reports from '../routes/app.reports._index';

vi.mock('react-router', () => ({
  useLoaderData: vi.fn(),
  useFetcher: () => ({ state: 'idle', data: null, submit: vi.fn() }),
}));

vi.mock('@prisma/client', () => ({
  ExperimentStatus: {
    active: 'active',
    completed: 'completed',
    archived: 'archived',
    paused: 'paused',
    draft: 'draft',
  },
}));

vi.mock('../shopify.server', () => ({
  default: { authenticate: { admin: vi.fn() } },
}));

vi.mock('../db.server', () => ({
  default: {
    experiment: { findMany: vi.fn() },
  },
}));

vi.mock('../utils/formatRuntime.js', () => ({
  formatRuntime: () => '5 days',
}));

vi.mock('../components/DateRangePicker', () => ({
  default: () => null,
}));

vi.mock('../components/SessionsCard', () => ({
  default: () => null,
}));

vi.mock('../components/ConversionsCard', () => ({
  default: () => null,
}));

vi.mock('../contexts/DateRangeContext', () => ({
  useDateRange: vi.fn(() => ({ dateRange: null })),
  formatDateForDisplay: vi.fn((d) => d),
}));

const mockExperiments = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1,
  name: `Experiment ${i + 1}`,
  status: 'active',
  startDate: '2025-06-01',
  endDate: null,
  endCondition: 'Manual',
  analyses: [{ id: i + 100, totalConversions: 10, totalUsers: 100 }],
}));

describe('Reports Pagination', () => {
  beforeEach(() => {
    useLoaderData.mockReturnValue({
      experiments: mockExperiments,
      sessionData: { sessions: [], total: 0 },
      conversionsData: { sessions: [], total: 0 },
      tutorialData: { viewedReportsPage: true },
      shop: 'test-shop.myshopify.com',
    });
  });

  it('shows only 6 experiments on the first page', () => {
    render(<Reports />);
    expect(screen.getByText('Experiment 1')).toBeInTheDocument();
    expect(screen.getByText('Experiment 6')).toBeInTheDocument();
    expect(screen.queryByText('Experiment 7')).not.toBeInTheDocument();
  });

  it('shows correct page info text on page 1', () => {
    render(<Reports />);
    expect(screen.getByText(/Showing 1-6 of 8/)).toBeInTheDocument();
  });

  it('Previous button is disabled on page 1', () => {
    render(<Reports />);
    expect(screen.getByText('Previous')).toBeDisabled();
  });

  it('navigates to page 2 when Next is clicked', () => {
    render(<Reports />);
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Experiment 7')).toBeInTheDocument();
    expect(screen.getByText('Experiment 8')).toBeInTheDocument();
    expect(screen.queryByText('Experiment 1')).not.toBeInTheDocument();
  });

  it('shows correct page info text on page 2', () => {
    render(<Reports />);
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText(/Showing 7-8 of 8/)).toBeInTheDocument();
  });

  it('Next button is disabled on the last page', () => {
    render(<Reports />);
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Next')).toBeDisabled();
  });

  it('can navigate back to page 1 from page 2', () => {
    render(<Reports />);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Previous'));
    expect(screen.getByText('Experiment 1')).toBeInTheDocument();
    expect(screen.queryByText('Experiment 7')).not.toBeInTheDocument();
  });

  it('shows no reporting data state when analysis is missing', () => {
    useLoaderData.mockReturnValue({
      experiments: mockExperiments.map((exp) => ({ ...exp, analyses: [] })),
      sessionData: { sessions: [], total: 0 },
      conversionsData: { sessions: [], total: 0 },
      tutorialData: { viewedReportsPage: true },
      shop: 'test-shop.myshopify.com',
    });

    render(<Reports />);
    expect(screen.getAllByText('No reporting data').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Showing 1-6 of 8/)).not.toBeInTheDocument();
  });
});