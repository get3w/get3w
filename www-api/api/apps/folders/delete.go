package folders

import (
	"net/http"
	"time"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/pkg/timeutils"
	"github.com/get3w/get3w/storage"
	"github.com/get3w/get3w/www-api/api"
	"github.com/labstack/echo"
)

// Delete folder
func Delete(c *echo.Context) error {
	appPath := c.Param("app_path")
	if appPath == "" {
		return api.ErrorNotFound(c, nil)
	}

	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}

	input := &get3w.FolderDeleteInput{}
	err := api.LoadRequestInput(c, input)
	if err != nil {
		return api.ErrorBadRequest(c, err)
	}
	if input.Path == "" {
		return api.ErrorBadRequest(c, nil)
	}

	app, err := api.GetApp(appPath)
	if err != nil {
		return api.ErrorInternal(c, err)
	}
	if app == nil {
		return api.ErrorNotFound(c, nil)
	}

	parser, err := storage.NewLocalParser(appPath)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	parser.Storage.DeleteFolder(parser.Storage.GetSourcePrefix(input.Path))

	output := &get3w.FolderDeleteOutput{
		LastModified: timeutils.ToString(time.Now()),
	}
	return c.JSON(http.StatusOK, output)
}
