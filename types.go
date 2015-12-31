package get3w

// User represents a Get3W user.
type User struct {
	ID                string `json:"id,omitempty"`
	Username          string `json:"username,omitempty"`
	Email             string `json:"email,omitempty"`
	AvatarURL         string `json:"avatar_url,omitempty"`
	CreatedAt         string `json:"created_at,omitempty"`
	UpdatedAt         string `json:"updated_at,omitempty"`
	Starred           int64  `json:"starred,omitempty"`
	Locale            string `json:"locale,omitempty"`
	Company           string `json:"company,omitempty"`
	Location          string `json:"location,omitempty"`
	URL               string `json:"url,omitempty"`
	BillingPlanID     string `json:"billing_plan_id,omitempty"`
	BillingCustomerID string `json:"billing_customer_id,omitempty"`
	BillingCardID     string `json:"billing_card_id,omitempty"`
}

// Token contains user's access token
type Token struct {
	// Owner is hash key
	Owner string `json:"owner,omitempty"`
	// Scope is range key
	Scopes string `json:"scopes,omitempty"`
	// AccessToken is golbal key
	AccessToken string `json:"access_token,omitempty"`
	CreatedAt   string `json:"created_at,omitempty"`
}

// App contains the information of the app
type App struct {
	ID          string `json:"id,omitempty"`
	Owner       string `json:"owner,omitempty"`
	Name        string `json:"name,omitempty"`
	Path        string `json:"path,omitempty"`
	Private     bool   `json:"private,omitempty"`
	CreatedAt   string `json:"created_at,omitempty"`
	UpdatedAt   string `json:"updated_at,omitempty"`
	StarCount   int64  `json:"star_count,omitempty"`
	CloneCount  int64  `json:"clone_count,omitempty"`
	Origin      string `json:"origin,omitempty"`
	URL         string `json:"url,omitempty"`
	Description string `json:"description,omitempty"`
	Tags        string `json:"tags,omitempty"`
}

// File represents a file or folder.
type File struct {
	IsDir        bool   `json:"is_dir,omitempty"`
	Path         string `json:"path,omitempty"`
	Name         string `json:"name,omitempty"`
	Size         int64  `json:"size,omitempty"`
	Checksum     string `json:"checksum,omitempty"`
	LastModified string `json:"last_modified,omitempty"`
}

// Site describes a language
type Site struct {
	Name string `yaml:"-" json:"name,omitempty" structs:"name"`
	Path string `yaml:"-" json:"path,omitempty" structs:"path"`
	URL  string `yaml:"-" json:"url,omitempty" structs:"url"`

	Posts         []*Post        `yaml:"-" json:"posts,omitempty" structs:"posts"`
	LinkSummaries []*LinkSummary `yaml:"-" json:"link_summaries,omitempty" structs:"link_summaries"`
	Links         []*Link        `yaml:"-" json:"links,omitempty" structs:"links"`
	Sections      []*Section     `yaml:"-" json:"sections,omitempty" structs:"sections"`

	AllParameters map[string]interface{} `yaml:"-" json:"-" structs:"-"`
}

// Config contains the information of the app config
type Config struct {
	Title          string      `yaml:"title,omitempty" json:"title,omitempty" structs:"title"`
	Keywords       string      `yaml:"keywords,omitempty" json:"keywords,omitempty" structs:"keywords"`
	Description    string      `yaml:"description,omitempty" json:"description,omitempty" structs:"description"`
	FaviconURL     string      `yaml:"favicon_url,omitempty" json:"favicon_url,omitempty" structs:"favicon_url"`
	TemplateEngine string      `yaml:"template_engine,omitempty" json:"template_engine,omitempty" structs:"template_engine"`
	LayoutLink     string      `yaml:"layout_channel,omitempty" json:"layout_channel,omitempty" structs:"layout_channel"`
	LayoutPost     string      `yaml:"layout_post,omitempty" json:"layout_post,omitempty" structs:"layout_post"`
	Repository     *Repository `yaml:"repository,omitempty" json:"repository,omitempty" structs:"repository"`
	// Where things are
	Source      string `yaml:"source,omitempty" json:"source,omitempty" structs:"source"`
	Destination string `yaml:"destination,omitempty" json:"destination,omitempty" structs:"destination"`
	LayoutsDir  string `yaml:"layouts_dir,omitempty" json:"layouts_dir,omitempty" structs:"layouts_dir"`
	LogsDir     string `yaml:"logs_dir,omitempty" json:"logs_dir,omitempty" structs:"logs_dir"`
	IncludesDir string `yaml:"includes_dir,omitempty" json:"includes_dir,omitempty" structs:"includes_dir"`
	SectionsDir string `yaml:"sections_dir,omitempty" json:"sections_dir,omitempty" structs:"sections_dir"`
	ImagesDir   string `yaml:"images_dir,omitempty" json:"images_dir,omitempty" structs:"images_dir"`
	// Handling Reading
	Include []string `yaml:"include,omitempty" json:"include,omitempty" structs:"include"`
	Exclude []string `yaml:"exclude,omitempty" json:"exclude,omitempty" structs:"exclude"`
}

// Repository describes a repository
type Repository struct {
	Host  string `yaml:"host,omitempty" json:"host,omitempty"`
	Owner string `yaml:"owner,omitempty" json:"owner,omitempty"`
	Name  string `yaml:"name,omitempty" json:"name,omitempty"`
}

// LinkSummary contains link information
type LinkSummary struct {
	Name string `yaml:"-" json:"name,omitempty"`
	Path string `yaml:"-" json:"path,omitempty"`
	URL  string `yaml:"-" json:"url,omitempty"`

	Children []*LinkSummary `yaml:"-" json:"children,omitempty"`
}

// Link contains the information of the app page
type Link struct {
	Title       string   `yaml:"title,omitempty" json:"title,omitempty" structs:"title"`
	Keywords    string   `yaml:"keywords,omitempty" json:"keywords,omitempty" structs:"keywords"`
	Description string   `yaml:"description,omitempty" json:"description,omitempty" structs:"description"`
	Sections    []string `yaml:"sections,omitempty" json:"sections,omitempty" structs:"sections"`

	Layout   string `yaml:"layout,omitempty" json:"layout,omitempty" structs:"layout"`
	URL      string `yaml:"url,omitempty" json:"url,omitempty" structs:"url"`
	PostPath string `yaml:"post_path,omitempty" json:"post_path,omitempty" structs:"post_path"`
	Paginate int    `yaml:"paginate,omitempty" json:"paginate,omitempty" structs:"paginate"`

	Name     string  `yaml:"-" json:"name,omitempty" structs:"name"`
	Path     string  `yaml:"-" json:"path,omitempty" structs:"path"`
	Content  string  `yaml:"-" json:"content,omitempty" structs:"content"`
	Children []*Link `yaml:"-" json:"children,omitempty" structs:"children"`

	Posts         []*Post                `yaml:"-" json:"-,omitempty" structs:"posts"`
	AllParameters map[string]interface{} `yaml:"-" json:"-,omitempty" structs:"-"`
}

// Section contains the information of the app section
type Section struct {
	ID   string `yaml:"id,omitempty" json:"id,omitempty"`
	Name string `yaml:"name,omitempty" json:"name,omitempty"`
	HTML string `yaml:"html,omitempty" json:"html,omitempty"`
	CSS  string `yaml:"css,omitempty" json:"css,omitempty"`
	JS   string `yaml:"js,omitempty" json:"js,omitempty"`
}

// Post contains the information of the post
type Post struct {
	ID       string `yaml:"id,omitempty" json:"id,omitempty" structs:"id"`
	Title    string `yaml:"title,omitempty" json:"title,omitempty" structs:"title"`
	Layout   string `yaml:"layout,omitempty" json:"layout,omitempty" structs:"layout"`
	Path     string `yaml:"path,omitempty" json:"path,omitempty" structs:"path"`
	URL      string `yaml:"url,omitempty" json:"url,omitempty" structs:"url"`
	Paginate int    `yaml:"paginate,omitempty" json:"paginate,omitempty" structs:"paginate"`
	Content  string `yaml:"-" json:"content,omitempty" structs:"content"`

	AllParameters map[string]interface{} `yaml:"-" json:"-,omitempty" structs:"-"`
}

// Paginator describes a paginator
type Paginator struct {
	// current page number
	Page int `yaml:"page,omitempty" json:"page,omitempty" structs:"page"`
	// number of posts per page
	PerPage int `yaml:"per_page,omitempty" json:"per_page,omitempty" structs:"per_page"`
	// a list of posts for the current page
	Posts []*Post `yaml:"posts,omitempty" json:"posts,omitempty" structs:"posts"`
	// total number of posts in the site
	TotalPosts int `yaml:"total_posts,omitempty" json:"total_posts,omitempty" structs:"total_posts"`
	// number of pagination pages
	TotalPages int `yaml:"total_pages,omitempty" json:"total_pages,omitempty" structs:"total_pages"`
	// page number of the previous pagination page, or nil if no previous page exists
	PreviousPage int `yaml:"previous_page,omitempty" json:"previous_page,omitempty" structs:"previous_page"`
	// path of previous pagination page, or blank if no previous page exists
	PreviousPagePath string `yaml:"previous_page_path,omitempty" json:"previous_page_path,omitempty" structs:"previous_page_path"`
	// page number of the next pagination page, or nil if no subsequent page exists
	NextPage int `yaml:"next_page,omitempty" json:"next_page,omitempty" structs:"next_page"`
	// path of next pagination page, or nil if no subsequent page exists
	NextPagePath string `yaml:"next_page_path,omitempty" json:"next_page_path,omitempty" structs:"next_page_path"`
	// path of current pagination page
	Path string `yaml:"path,omitempty" json:"path,omitempty" structs:"path"`
}

// SavePayload contains data for save method
type SavePayload struct {
	Type   string                 `json:"type,omitempty"`
	Status string                 `json:"status,omitempty"`
	Data   map[string]interface{} `json:"data,omitempty"`
}
