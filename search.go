package get3w

import (
	"fmt"

	qs "github.com/google/go-querystring/query"
)

// SearchService handles communication with the search related
// methods of the Get3w API.
type SearchService struct {
	client *Client
}

// SearchOptions specifies optional parameters to the SearchService methods.
type SearchOptions struct {
	// How to sort the search results.  Possible values are:
	//   - for Apps: stars, fork, updated
	//   - for code: indexed
	//   - for issues: comments, created, updated
	//   - for users: followers, Apps, joined
	//
	// Default is to sort by best match.
	Sort string `url:"sort,omitempty"`

	// Sort order if sort parameter is provided. Possible values are: asc,
	// desc. Default is desc.
	Order string `url:"order,omitempty"`
}

// AppsSearchResult represents the result of a Apps search.
type AppsSearchResult struct {
	TotalCount int          `json:"total_count,omitempty"`
	AppResults []*AppResult `json:"items,omitempty"`
}

// AppResult represents a app search result.
type AppResult struct {
	App  *App  `json:"app,omitempty"`
	User *User `json:"user,omitempty"`
}

// Apps searches apps via various criteria.
func (s *SearchService) Apps(query string, opt *SearchOptions) (*AppsSearchResult, *Response, error) {
	result := new(AppsSearchResult)
	resp, err := s.search("apps", query, opt, result)
	return result, resp, err
}

// Helper function that executes search queries against different
// Get3W search types (apps, users)
func (s *SearchService) search(searchType string, query string, opt *SearchOptions, result interface{}) (*Response, error) {
	params, err := qs.Values(opt)
	if err != nil {
		return nil, err
	}
	params.Add("q", query)
	u := fmt.Sprintf("search/%s?%s", searchType, params.Encode())

	req, err := s.client.NewRequest("GET", u, nil)
	if err != nil {
		return nil, err
	}

	return s.client.Do(req, result)
}
