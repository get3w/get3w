package apps

import (
	"net/http"
	"time"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/pkg/timeutils"
	"github.com/get3w/get3w/server/api"
	"github.com/get3w/get3w/storage"

	"github.com/labstack/echo"
)

// Load app
func Load(c *echo.Context) error {
	appPath := c.Param("app_path")
	if appPath == "" {
		return api.ErrorNotFound(c, nil)
	}

	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}

	input := &get3w.AppLoadInput{}
	err := api.LoadRequestInput(c, input)
	if err != nil {
		return api.ErrorBadRequest(c, err)
	}

	parser, err := storage.NewLocalParser(api.Owner(c), appPath)
	if err != nil {
		return api.ErrorBadRequest(c, err)
	}
	parser.LoadSitesResources()

	app, err := api.GetApp(appPath)
	if err != nil {
		return api.ErrorInternal(c, err)
	}
	if app == nil {
		return api.ErrorNotFound(c, nil)
	}

	output := &get3w.AppLoadOutput{
		LastModified: timeutils.ToString(time.Now()),
		App:          app,
		Config:       parser.Config,
		Sites:        parser.Sites,
	}
	return c.JSON(http.StatusOK, output)
}
