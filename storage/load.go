package storage

import "github.com/get3w/get3w"

func loadConfigAndSites(s Storage) (config *get3w.Config, sites []*get3w.Site, defaultSite *get3w.Site) {
	config = loadConfig(s)
	sites, defaultSite = loadSites(s)
	return
}

// LoadSitesResources load resources for each site
func (parser *Parser) LoadSitesResources() {
	parser.EachSite(func() {
		parser.LoadSiteParameters()
		parser.LoadSitePosts()
		parser.LoadSitePageSummaries()
		parser.LoadSitePages()
		parser.LoadSiteSections(parser.Current.Pages)
		parser.LoadSiteLayouts()
	})
}
