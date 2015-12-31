package packages

// Output contains resources and html output to page
type Output struct {
	Assets      string
	Javascripts []string
	Stylesheets []string
	HTMLStart   string
	HTMLEnd     string
	HeadStart   string
	HeadEnd     string
	BodyStart   string
	BodyEnd     string
}

// Block contains methods to extend templating blocks
// example: "{% myTag %}World{% endMyTag %}"
type Block struct {
	Name  string
	Parse func(tagName, body string) string
}

// Filter contains methods to extend templating filters
// example: "{{ 'test'|myFilter }}"
type Filter struct {
	Name  string
	Parse func(body string) string
}

// Hook contains methods to process during build
// example: "{{ 'test'|myFilter }}"
type Hook struct {
	Name   string
	Init   func()
	Finish func()
}

// Plugin contains all objects to extend get3w
type Plugin struct {
	Outputs []*Output
	Blocks  []*Block
	Filters []*Filter
	Hook    *Hook
}
