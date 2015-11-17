package site

// NewLocalSite get key by pageName
func NewLocalSite(contextDir string, appname string) *Site {
	return &Site{
		Name: appname,
	}
}
