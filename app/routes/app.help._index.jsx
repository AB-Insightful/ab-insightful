import { useState, useMemo } from 'react';

export default function Help() {
    const [selectedFilter, setSelectedFilter] = useState('all'); //currently selected filter
    const [currentPage, setCurrentPage] = useState(1); //current page pagination is on
    const itemsPerPage = 4; //number of listings per page

    const handleFilterChange = (filter) => {
        setSelectedFilter(filter);
        setCurrentPage(1); //reset page number when new filter is selected
    };

    //define new help pages here
    const allSections = [
        {
            id: 'getting-started',
            category: 'getting-started',
            heading: 'Getting Started',
            description: 'Learn the basics and launch your first A/B test in minutes. A step-by-step guide to getting the app set up for success.',
            buttonText: 'View',
            buttonHref: '/app/data/GettingStarted'
        },
        {
            id: 'manage-experiments',
            category: 'manage-experiments',
            heading: 'Creating & Managing Experiments',
            description: 'Everything you need to build, launch, and modify your A/B tests. From defining conversion goals to scheduling your next experiment.',
            buttonText: 'View',
            buttonHref: '/app/data/CreateManageExperiments'
        },
        {
            id: 'understanding-results',
            category: 'statistics',
            heading: 'Understanding Your Results',
            description: 'Everything you need to build, launch, and modify your A/B tests. From defining conversion goals to scheduling your next experiment.',
            buttonText: 'View',
            buttonHref: '/app/data/UnderstandingResults'
        },
        {
            id: 'viewing-reports',
            category: 'reporting',
            heading: 'Viewing Reports',
            description: 'Everything you need to know about receiving reports.',
            isVideo: true,
            videoUrl: 'https://www.youtube.com/embed/huv4GDH8C-k?&rel=0',
            videoTitle: 'Viewing Reports Video Player'
        },
        {
            id: 'extra-box-1',
            category: 'statistics',
            heading: 'Extra box 1',
            description: 'Everything you need to build, launch, and modify your A/B tests. From defining conversion goals to scheduling your next experiment.',
            buttonText: 'View',
            buttonHref: '/app/data/UnderstandingResults'
        },
        {
            id: 'extra-box-2',
            category: 'statistics',
            heading: 'Extra box 2',
            description: 'Everything you need to build, launch, and modify your A/B tests. From defining conversion goals to scheduling your next experiment.',
            buttonText: 'View',
            buttonHref: '/app/data/UnderstandingResults'
        },
        {
            id: 'extra-box-3',
            category: 'statistics',
            heading: 'Extra box 3',
            description: 'Everything you need to build, launch, and modify your A/B tests. From defining conversion goals to scheduling your next experiment.',
            buttonText: 'View',
            buttonHref: '/app/data/UnderstandingResults'
        },
        {
            id: 'extra-box-4',
            category: 'statistics',
            heading: 'Extra box 4',
            description: 'Everything you need to build, launch, and modify your A/B tests. From defining conversion goals to scheduling your next experiment.',
            buttonText: 'View',
            buttonHref: '/app/data/UnderstandingResults'
        }
    ];

    // Filter sections based on selected filter
    const filteredSections = useMemo(() => {
        if (selectedFilter === 'all') {
            return allSections;
        }
        return allSections.filter(section => section.category === selectedFilter);
    }, [selectedFilter]);

    //calculated elements for pagination
    const totalPages = Math.ceil(filteredSections.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentSections = filteredSections.slice(startIndex, endIndex);

    //handler methods for next & previous buttons
    const handlePrevious = () => {
        if (currentPage > 1) {
            setCurrentPage(currentPage - 1);
        }
    };
    const handleNext = () => {
        if (currentPage < totalPages) {
            setCurrentPage(currentPage + 1);
        }
    };

    return (
        <s-page heading="Help">
            <s-stack gap="large-200" direction="block">
                
                {/*filter component*/}
                <s-button commandFor="filterComponent">
                    Filter By: {
                        selectedFilter === 'all' ? 'All' : 
                        selectedFilter === 'getting-started' ? 'Getting Started' : 
                        selectedFilter === 'manage-experiments' ? 'Manage Experiments' :
                        selectedFilter === 'reporting' ? 'Reporting' :
                        selectedFilter === 'statistics' ? 'Statistics' :
                        'All'
                    }
                </s-button>
                <s-menu id="filterComponent" accessibilityLabel="Filter actions">
                    <s-button icon="flag" onClick={() => handleFilterChange('getting-started')}>Getting Started</s-button>
                    <s-button icon="measurement-volume" onClick={() => handleFilterChange('manage-experiments')}>Manage Experiments</s-button>
                    <s-button icon="chart-vertical" onClick={() => handleFilterChange('statistics')}>Statistics</s-button>
                    <s-button icon="page-report" onClick={() => handleFilterChange('reporting')}>Reporting</s-button>
                    <s-button onClick={() => handleFilterChange('all')}>Show All</s-button>
                </s-menu>

                {/*display current pages*/}
                {currentSections.map(section => (
                    <s-section key={section.id} heading={section.heading}>
                        <s-paragraph>
                            <s-text>{section.description}</s-text>
                        </s-paragraph>
                        {/*if the section is a video build the iframe, else button text*/}
                        {section.isVideo ? (
                            <div style={{ margin: '20px 0' }}>
                                <iframe
                                    width="560"
                                    height="315"
                                    src={section.videoUrl}
                                    title={section.videoTitle}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                />
                            </div>
                        ) : (
                            <s-button href={section.buttonHref} target="_blank">
                                {section.buttonText}
                            </s-button>
                        )}
                    </s-section>
                ))}
                {/*pagination display elements*/}
                <>
                    {/*page information*/}
                    <s-paragraph>
                        <s-text>
                            Showing {startIndex + 1}-{Math.min(endIndex, filteredSections.length)} of {filteredSections.length} items
                            {totalPages > 1 && ` (Page ${currentPage} of ${totalPages})`}
                        </s-text>
                    </s-paragraph>

                    {/*next and previous buttons*/}
                    <s-button-group>
                        <s-button 
                            slot="secondary-actions" 
                            onClick={handlePrevious}
                            disabled={currentPage === 1}
                        >
                            Previous
                        </s-button>

                        <s-button 
                            slot="secondary-actions" 
                            onClick={handleNext}
                            disabled={currentPage === totalPages}
                        >
                            Next
                        </s-button>
                    </s-button-group>
                </>
            </s-stack>
        </s-page>
    );
}
