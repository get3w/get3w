package appfile

// NewAppfileByFileSystem get key by pageName
func NewAppfileByFileSystem(contextDir string, appname string) *Appfile {

	return &Appfile{
		Name: appname,
	}
}
