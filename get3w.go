package get3w

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"net/url"
	"os"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/google/go-querystring/query"
)

const (
	libraryVersion = "0.1"
	userAgent      = "go-get3w/" + libraryVersion

	mediaTypeV1      = "application/vnd.get3w+json; version=1"
	defaultMediaType = "application/octet-stream"

	// EnvironmentLocal indicate local enviroment
	EnvironmentLocal = "local"
	// EnvironmentStaging indicate staging enviroment
	EnvironmentStaging = "staging"
	// EnvironmentProduction indicate production enviroment
	EnvironmentProduction = "production"

	// AccessTokenScopesAll all permissions scopes
	AccessTokenScopesAll = "all"
)

// From
const (
	FromLocal = "local"
	FromCloud = "cloud"
)

// Payload status and type
const (
	PayloadStatusAdded    = "added"
	PayloadStatusModified = "modified"
	PayloadStatusRemoved  = "removed"

	PayloadTypeConfig  = "config"
	PayloadTypeSite    = "site"
	PayloadTypeLink    = "link"
	PayloadTypeSection = "section"
	PayloadTypeFile    = "file"
)

// A Client manages communication with the Get3W API.
type Client struct {
	// HTTP client used to communicate with the API.
	client *http.Client

	// accessToken contains authentication information with the Get3W API.
	accessToken string

	// Base URL for API requests.  BaseURL should
	// always be specified with a trailing slash.
	BaseURL *url.URL

	// Base URL for uploading files.
	UploadURL *url.URL

	// User agent used when communicating with the Get3W API.
	UserAgent string

	// Services used for talking to different parts of the Get3W API.
	Apps   *AppsService
	User   *UserService
	Users  *UsersService
	Search *SearchService
}

var (
	defaultRepositoryHost string
	apiBaseURL            string
	uploadBaseURL         string
	environment           string
)

func init() {
	defaultRepositoryHost = "get3w.com"
	apiBaseURL = "http://api.get3w.com/"
	uploadBaseURL = "https://upload.get3w.com/"
	environment = strings.ToLower(os.Getenv("ENVIRONMENT"))
	if environment == EnvironmentLocal {
		defaultRepositoryHost = "g3.com:99"
		apiBaseURL = "http://api.g3.com:99/"
		uploadBaseURL = "https://upload.g3.com:99/"
	} else if environment == EnvironmentStaging {
		defaultRepositoryHost = "get3w.net"
		apiBaseURL = "http://api.get3w.net/"
		uploadBaseURL = "https://upload.get3w.net/"
	} else {
		environment = EnvironmentProduction
	}
}

// UploadOptions specifies the parameters to methods that support uploads.
type UploadOptions struct {
	Name string `url:"name,omitempty"`
}

// addOptions adds the parameters in opt as URL query parameters to s.  opt
// must be a struct whose fields may contain "url" tags.
func addOptions(s string, opt interface{}) (string, error) {
	v := reflect.ValueOf(opt)
	if v.Kind() == reflect.Ptr && v.IsNil() {
		return s, nil
	}

	u, err := url.Parse(s)
	if err != nil {
		return s, err
	}

	qs, err := query.Values(opt)
	if err != nil {
		return s, err
	}

	u.RawQuery = qs.Encode()
	return u.String(), nil
}

// NewClient returns a new Get3W API client.  If a nil httpClient is
// provided, http.DefaultClient will be used.  To use API methods which require
// authentication, provide an http.Client that will perform the authentication
// for you (such as that provided by the golang.org/x/oauth2 library).
func NewClient(accessToken string) *Client {
	baseURL, _ := url.Parse(apiBaseURL)
	uploadURL, _ := url.Parse(uploadBaseURL)

	c := &Client{client: http.DefaultClient, accessToken: accessToken, BaseURL: baseURL, UserAgent: userAgent, UploadURL: uploadURL}
	c.Apps = &AppsService{client: c}
	c.User = &UserService{client: c}
	c.Users = &UsersService{client: c}
	c.Search = &SearchService{client: c}

	return c
}

// NewRequest creates an API request. A relative URL can be provided in urlStr,
// in which case it is resolved relative to the BaseURL of the Client.
// Relative URLs should always be specified without a preceding slash.  If
// specified, the value pointed to by body is JSON encoded and included as the
// request body.
func (c *Client) NewRequest(method, urlStr string, body interface{}) (*http.Request, error) {
	rel, err := url.Parse(urlStr)
	if err != nil {
		return nil, err
	}

	u := c.BaseURL.ResolveReference(rel)

	var buf io.ReadWriter
	if body != nil {
		buf = new(bytes.Buffer)
		err := json.NewEncoder(buf).Encode(body)
		if err != nil {
			return nil, err
		}
	}

	req, err := http.NewRequest(method, u.String(), buf)
	if err != nil {
		return nil, err
	}

	if c.accessToken != "" {
		req.Header.Add("Authorization", "Bearer "+c.accessToken)
	}

	req.Header.Add("Accept", mediaTypeV1)
	if c.UserAgent != "" {
		req.Header.Add("User-Agent", c.UserAgent)
	}
	return req, nil
}

// NewUploadRequest creates an upload request. A relative URL can be provided in
// urlStr, in which case it is resolved relative to the UploadURL of the Client.
// Relative URLs should always be specified without a preceding slash.
func (c *Client) NewUploadRequest(urlStr string, reader io.Reader, size int64, mediaType string) (*http.Request, error) {
	rel, err := url.Parse(urlStr)
	if err != nil {
		return nil, err
	}

	u := c.UploadURL.ResolveReference(rel)
	req, err := http.NewRequest("POST", u.String(), reader)
	if err != nil {
		return nil, err
	}
	req.ContentLength = size

	if len(mediaType) == 0 {
		mediaType = defaultMediaType
	}
	req.Header.Add("Content-Type", mediaType)
	req.Header.Add("Accept", mediaTypeV1)
	req.Header.Add("User-Agent", c.UserAgent)
	return req, nil
}

// Response is a Get3W API response.  This wraps the standard http.Response
// returned from Get3W and provides convenient access to things like
// pagination links.
type Response struct {
	*http.Response

	// These fields provide the page values for paginating through a set of
	// results.  Any or all of these may be set to the zero value for
	// responses that are not part of a paginated set, or for which there
	// are no additional pages.

	NextPage  int
	PrevPage  int
	FirstPage int
	LastPage  int
}

// newResponse creates a new Response for the provided http.Response.
func newResponse(r *http.Response) *Response {
	response := &Response{Response: r}
	response.populatePageValues()
	return response
}

// populatePageValues parses the HTTP Link response headers and populates the
// various pagination link values in the Reponse.
func (r *Response) populatePageValues() {
	if links, ok := r.Response.Header["Link"]; ok && len(links) > 0 {
		for _, link := range strings.Split(links[0], ",") {
			segments := strings.Split(strings.TrimSpace(link), ";")

			// link must at least have href and rel
			if len(segments) < 2 {
				continue
			}

			// ensure href is properly formatted
			if !strings.HasPrefix(segments[0], "<") || !strings.HasSuffix(segments[0], ">") {
				continue
			}

			// try to pull out page parameter
			url, err := url.Parse(segments[0][1 : len(segments[0])-1])
			if err != nil {
				continue
			}
			page := url.Query().Get("page")
			if page == "" {
				continue
			}

			for _, segment := range segments[1:] {
				switch strings.TrimSpace(segment) {
				case `rel="next"`:
					r.NextPage, _ = strconv.Atoi(page)
				case `rel="prev"`:
					r.PrevPage, _ = strconv.Atoi(page)
				case `rel="first"`:
					r.FirstPage, _ = strconv.Atoi(page)
				case `rel="last"`:
					r.LastPage, _ = strconv.Atoi(page)
				}

			}
		}
	}
}

// Do sends an API request and returns the API response.  The API response is
// JSON decoded and stored in the value pointed to by v, or returned as an
// error if an API error has occurred.  If v implements the io.Writer
// interface, the raw response body will be written to v, without attempting to
// first decode it.
func (c *Client) Do(req *http.Request, v interface{}) (*Response, error) {
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}

	defer resp.Body.Close()

	response := newResponse(resp)

	err = CheckResponse(resp)
	if err != nil {
		// even though there was an error, we still return the response
		// in case the caller wants to inspect it further
		return response, err
	}

	if v != nil {
		if w, ok := v.(io.Writer); ok {
			io.Copy(w, resp.Body)
		} else {
			err = json.NewDecoder(resp.Body).Decode(v)
		}
	}
	return response, err
}

/*
An ErrorResponse reports one or more errors caused by an API request.

Get3W API docs: http://developer.github.com/v3/#client-errors
*/
type ErrorResponse struct {
	Message string `json:"message"`
	Status  int    `json:"status"`
}

func (e *ErrorResponse) Error() string {
	return fmt.Sprintf("%d %v", e.Status, e.Message)
}

// sanitizeURL redacts the client_id and client_secret tokens from the URL which
// may be exposed to the user, specifically in the ErrorResponse error message.
func sanitizeURL(uri *url.URL) *url.URL {
	if uri == nil {
		return nil
	}
	params := uri.Query()
	if len(params.Get("client_secret")) > 0 {
		params.Set("client_secret", "REDACTED")
		uri.RawQuery = params.Encode()
	}
	return uri
}

// CheckResponse checks the API response for errors, and returns them if
// present.  A response is considered an error if it has a status code outside
// the 200 range.  API error responses are expected to have either no response
// body, or a JSON response body that maps to ErrorResponse.  Any other
// response body will be silently ignored.
func CheckResponse(r *http.Response) error {
	if c := r.StatusCode; 200 <= c && c <= 299 {
		return nil
	}
	errorResponse := &ErrorResponse{}
	data, err := ioutil.ReadAll(r.Body)
	if err == nil && data != nil {
		json.Unmarshal(data, errorResponse)
	}
	return errorResponse
}

// parseBoolResponse determines the boolean result from a Get3W API response.
// Several Get3W API methods return boolean responses indicated by the HTTP
// status code in the response (true indicated by a 204, false indicated by a
// 404).  This helper function will determine that result and hide the 404
// error if present.  Any other error will be returned through as-is.
// func parseBoolResponse(err error) (bool, error) {
// 	if err == nil {
// 		return true, nil
// 	}
//
// 	if err, ok := err.(*ErrorResponse); ok && err.Status == http.StatusNotFound {
// 		// Simply false.  In this one case, we do not pass the error through.
// 		return false, nil
// 	}
//
// 	// some other real error occurred
// 	return false, err
// }

// Bool is a helper routine that allocates a new bool value
// to store v and returns a pointer to it.
func Bool(v bool) *bool {
	p := new(bool)
	*p = v
	return p
}

// Int is a helper routine that allocates a new int32 value
// to store v and returns a pointer to it, but unlike Int32
// its argument value is an int.
func Int(v int) *int {
	p := new(int)
	*p = v
	return p
}

// String is a helper routine that allocates a new string value
// to store v and returns a pointer to it.
func String(v string) *string {
	p := new(string)
	*p = v
	return p
}

// Time is a helper routine that returns a pointer to it.
func Time(v time.Time) *time.Time {
	return &v
}

// Error is a helper routine that allocates a new string value
// to store v and returns a pointer to it.
func Error(v string) error {
	return fmt.Errorf("%v", v)
}

// Environment returns environment of running.
func Environment() string {
	return environment
}

// DefaultRepositoryHost returns default repository host.
func DefaultRepositoryHost() string {
	return defaultRepositoryHost
}
