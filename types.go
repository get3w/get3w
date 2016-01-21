package get3w

// User represents a Get3W user.
type User struct {
	ID                string `json:"id"`
	Username          string `json:"username"`
	Email             string `json:"email"`
	AvatarURL         string `json:"avatar_url"`
	CreatedAt         string `json:"created_at"`
	UpdatedAt         string `json:"updated_at"`
	Starred           int64  `json:"starred"`
	Locale            string `json:"locale"`
	Company           string `json:"company"`
	Location          string `json:"location"`
	URL               string `json:"url"`
	BillingPlanID     string `json:"billing_plan_id"`
	BillingCustomerID string `json:"billing_customer_id"`
	BillingCardID     string `json:"billing_card_id"`
}

// Token contains user's access token
type Token struct {
	// Owner is hash key
	Owner string `json:"owner"`
	// Scope is range key
	Scopes string `json:"scopes"`
	// AccessToken is golbal key
	AccessToken string `json:"access_token"`
	CreatedAt   string `json:"created_at"`
}

// App contains the information of the app
type App struct {
	ID          string `json:"id"`
	Owner       string `json:"owner"`
	Name        string `json:"name"`
	From        string `json:"from"`
	Path        string `json:"path"`
	Private     bool   `json:"private"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
	StarCount   int64  `json:"star_count"`
	CloneCount  int64  `json:"clone_count"`
	Origin      string `json:"origin"`
	URL         string `json:"url"`
	Description string `json:"description"`
	Tags        string `json:"tags"`
}

// File represents a file or folder.
type File struct {
	IsDir        bool   `json:"is_dir"`
	Path         string `json:"path"`
	Name         string `json:"name"`
	Size         int64  `json:"size"`
	Checksum     string `json:"checksum"`
	LastModified string `json:"last_modified"`
}

// Site describes a language
type Site struct {
	Name string `yaml:"-" json:"name" structs:"name"`
	Path string `yaml:"-" json:"path" structs:"path"`
	URL  string `yaml:"-" json:"url" structs:"url"`

	Posts         []*Post        `yaml:"-" json:"posts" structs:"posts"`
	PageSummaries []*PageSummary `yaml:"-" json:"page_summaries" structs:"page_summaries"`
	Pages         []*Page        `yaml:"-" json:"pages" structs:"pages"`
	Sections      []*Section     `yaml:"-" json:"sections" structs:"sections"`

	AllParameters map[string]interface{} `yaml:"-" json:"-" structs:"-"`
}

// Config contains the information of the app config
type Config struct {
	Title          string `yaml:"title,omitempty" json:"title" structs:"title"`
	Keywords       string `yaml:"keywords,omitempty" json:"keywords" structs:"keywords"`
	Description    string `yaml:"description,omitempty" json:"description" structs:"description"`
	FaviconURL     string `yaml:"favicon_url,omitempty" json:"favicon_url" structs:"favicon_url"`
	TemplateEngine string `yaml:"template_engine,omitempty" json:"template_engine" structs:"template_engine"`
	LayoutPage     string `yaml:"layout_page,omitempty" json:"layout_page" structs:"layout_page"`
	LayoutPost     string `yaml:"layout_post,omitempty" json:"layout_post" structs:"layout_post"`
	// Where things are
	Source      string `yaml:"source,omitempty" json:"source" structs:"source"`
	Destination string `yaml:"destination,omitempty" json:"destination" structs:"destination"`
	LayoutsDir  string `yaml:"layouts_dir,omitempty" json:"layouts_dir" structs:"layouts_dir"`
	LogsDir     string `yaml:"logs_dir,omitempty" json:"logs_dir" structs:"logs_dir"`
	IncludesDir string `yaml:"includes_dir,omitempty" json:"includes_dir" structs:"includes_dir"`
	SectionsDir string `yaml:"sections_dir,omitempty" json:"sections_dir" structs:"sections_dir"`
	ImagesDir   string `yaml:"images_dir,omitempty" json:"images_dir" structs:"images_dir"`
	UploadsDir  string `yaml:"uploads_dir,omitempty" json:"uploads_dir" structs:"uploads_dir"`
	// Handling Reading
	Include []string `yaml:"include,omitempty" json:"include" structs:"include"`
	Exclude []string `yaml:"exclude,omitempty" json:"exclude" structs:"exclude"`
}

// PageSummary contains page information
type PageSummary struct {
	Name string `yaml:"-" json:"name"`
	Path string `yaml:"-" json:"path"`
	URL  string `yaml:"-" json:"url"`

	Children []*PageSummary `yaml:"-" json:"children"`
}

// Page contains the information of the app page
type Page struct {
	Title       string   `yaml:"title,omitempty" json:"title" structs:"title"`
	Keywords    string   `yaml:"keywords,omitempty" json:"keywords" structs:"keywords"`
	Description string   `yaml:"description,omitempty" json:"description" structs:"description"`
	Sections    []string `yaml:"sections,omitempty" json:"sections" structs:"sections"`

	Layout   string `yaml:"layout,omitempty" json:"layout" structs:"layout"`
	URL      string `yaml:"url,omitempty" json:"url" structs:"url"`
	PostPath string `yaml:"post_path,omitempty" json:"post_path" structs:"post_path"`
	Paginate int    `yaml:"paginate,omitempty" json:"paginate" structs:"paginate"`

	Name     string  `yaml:"-" json:"name" structs:"name"`
	Path     string  `yaml:"-" json:"path" structs:"path"`
	Content  string  `yaml:"-" json:"content" structs:"content"`
	Children []*Page `yaml:"-" json:"children" structs:"children"`

	Posts         []*Post                `yaml:"-" json:"-" structs:"posts"`
	AllParameters map[string]interface{} `yaml:"-" json:"-" structs:"-"`
}

// Section contains the information of the app section
type Section struct {
	ID   string `yaml:"id,omitempty" json:"id"`
	Name string `yaml:"name,omitempty" json:"name"`
	HTML string `yaml:"html,omitempty" json:"html"`
	CSS  string `yaml:"css,omitempty" json:"css"`
	JS   string `yaml:"js,omitempty" json:"js"`
}

// Post contains the information of the post
type Post struct {
	ID       string `yaml:"id,omitempty" json:"id" structs:"id"`
	Title    string `yaml:"title,omitempty" json:"title" structs:"title"`
	Layout   string `yaml:"layout,omitempty" json:"layout" structs:"layout"`
	Path     string `yaml:"path,omitempty" json:"path" structs:"path"`
	URL      string `yaml:"url,omitempty" json:"url" structs:"url"`
	Paginate int    `yaml:"paginate,omitempty" json:"paginate" structs:"paginate"`
	Content  string `yaml:"-" json:"content" structs:"content"`

	AllParameters map[string]interface{} `yaml:"-" json:"-" structs:"-"`
}

// Paginator describes a paginator
type Paginator struct {
	// current page number
	Page int `yaml:"page,omitempty" json:"page" structs:"page"`
	// number of posts per page
	PerPage int `yaml:"per_page,omitempty" json:"per_page" structs:"per_page"`
	// a list of posts for the current page
	Posts []*Post `yaml:"posts,omitempty" json:"posts" structs:"posts"`
	// total number of posts in the site
	TotalPosts int `yaml:"total_posts,omitempty" json:"total_posts" structs:"total_posts"`
	// number of pagination pages
	TotalPages int `yaml:"total_pages,omitempty" json:"total_pages" structs:"total_pages"`
	// page number of the previous pagination page, or nil if no previous page exists
	PreviousPage int `yaml:"previous_page,omitempty" json:"previous_page" structs:"previous_page"`
	// path of previous pagination page, or blank if no previous page exists
	PreviousPagePath string `yaml:"previous_page_path,omitempty" json:"previous_page_path" structs:"previous_page_path"`
	// page number of the next pagination page, or nil if no subsequent page exists
	NextPage int `yaml:"next_page,omitempty" json:"next_page" structs:"next_page"`
	// path of next pagination page, or nil if no subsequent page exists
	NextPagePath string `yaml:"next_page_path,omitempty" json:"next_page_path" structs:"next_page_path"`
	// path of current pagination page
	Path string `yaml:"path,omitempty" json:"path" structs:"path"`
}

// SavePayload contains data for save method
type SavePayload struct {
	Type   string                 `json:"type"`
	Status string                 `json:"status"`
	Data   map[string]interface{} `json:"data"`
}
